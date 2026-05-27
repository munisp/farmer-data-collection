"""
Graph Neural Network for Farmer-Cooperative-Market Knowledge Graph

Architecture: GraphSAGE-style message passing with heterogeneous node/edge types.
Runs on the farmer↔cooperative↔market graph stored in Neo4j.

Tasks:
1. Farmer credit risk propagation (cooperative membership improves scores)
2. Market price influence propagation
3. Supply chain link prediction (which cooperative should sell at which market?)
4. Fraud ring detection via graph anomaly scoring

Uses PyTorch Geometric (torch_geometric) for message passing.
Falls back to pure PyTorch if torch_geometric is not installed.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Tuple, Optional
import math


class GraphAttentionLayer(nn.Module):
    """Single-head graph attention layer (GAT)."""

    def __init__(self, in_features: int, out_features: int, dropout: float = 0.1):
        super().__init__()
        self.W = nn.Linear(in_features, out_features, bias=False)
        self.a = nn.Linear(2 * out_features, 1, bias=False)
        self.dropout = nn.Dropout(dropout)
        self.leaky_relu = nn.LeakyReLU(0.2)

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
    ) -> torch.Tensor:
        """
        x: (num_nodes, in_features)
        edge_index: (2, num_edges) — [source, target]
        """
        Wh = self.W(x)
        src, dst = edge_index[0], edge_index[1]

        # Attention coefficients
        edge_h = torch.cat([Wh[src], Wh[dst]], dim=1)
        e = self.leaky_relu(self.a(edge_h)).squeeze(-1)

        # Softmax per destination node
        alpha = self._sparse_softmax(e, dst, x.size(0))
        alpha = self.dropout(alpha)

        # Aggregate
        out = torch.zeros_like(Wh)
        out.index_add_(0, dst, alpha.unsqueeze(-1) * Wh[src])
        return out

    def _sparse_softmax(
        self, scores: torch.Tensor, index: torch.Tensor, num_nodes: int
    ) -> torch.Tensor:
        scores_exp = torch.exp(scores - scores.max())
        denom = torch.zeros(num_nodes, device=scores.device)
        denom.index_add_(0, index, scores_exp)
        return scores_exp / (denom[index] + 1e-12)


class FarmerGraphNet(nn.Module):
    """
    Heterogeneous GNN for the farmer-cooperative-market knowledge graph.
    
    Architecture:
        Input projection (per node type) →
        GAT Layer 1 (shared) →
        GAT Layer 2 (shared) →
        Task-specific heads:
            - credit_risk: node classification (farmer nodes → repay probability)
            - link_prediction: edge scoring (cooperative → market supply links)
            - anomaly: node anomaly scores (fraud ring detection)
    
    Node feature dims:
        farmer: 6, cooperative: 6, market: 6
    Projected to shared dim: 32
    Hidden dim: 64
    """

    def __init__(
        self,
        farmer_feat_dim: int = 6,
        coop_feat_dim: int = 6,
        market_feat_dim: int = 6,
        shared_dim: int = 32,
        hidden_dim: int = 64,
        dropout: float = 0.2,
    ):
        super().__init__()

        # Per-type input projections
        self.farmer_proj = nn.Linear(farmer_feat_dim, shared_dim)
        self.coop_proj = nn.Linear(coop_feat_dim, shared_dim)
        self.market_proj = nn.Linear(market_feat_dim, shared_dim)

        # Shared GAT layers
        self.gat1 = GraphAttentionLayer(shared_dim, hidden_dim, dropout)
        self.gat2 = GraphAttentionLayer(hidden_dim, hidden_dim, dropout)

        self.norm1 = nn.LayerNorm(hidden_dim)
        self.norm2 = nn.LayerNorm(hidden_dim)
        self.dropout = nn.Dropout(dropout)

        # Task heads
        self.credit_head = nn.Sequential(
            nn.Linear(hidden_dim, 32), nn.ReLU(),
            nn.Linear(32, 1), nn.Sigmoid(),
        )
        self.anomaly_head = nn.Sequential(
            nn.Linear(hidden_dim, 32), nn.ReLU(),
            nn.Linear(32, 1), nn.Sigmoid(),
        )
        self.link_head = nn.Sequential(
            nn.Linear(hidden_dim * 2, 64), nn.ReLU(),
            nn.Linear(64, 1), nn.Sigmoid(),
        )

    def forward(
        self,
        farmer_feats: torch.Tensor,
        coop_feats: torch.Tensor,
        market_feats: torch.Tensor,
        edge_index: torch.Tensor,
        node_type_offsets: Dict[str, int],
    ) -> Dict[str, torch.Tensor]:
        # Project each node type
        hf = F.relu(self.farmer_proj(farmer_feats))
        hc = F.relu(self.coop_proj(coop_feats))
        hm = F.relu(self.market_proj(market_feats))

        # Concatenate into single node feature matrix
        x = torch.cat([hf, hc, hm], dim=0)

        # GAT layers with residual
        x1 = self.norm1(F.elu(self.gat1(x, edge_index)))
        x1 = self.dropout(x1)
        x2 = self.norm2(F.elu(self.gat2(x1, edge_index)) + x1)

        # Split back to node types
        f_end = node_type_offsets["farmer"]
        c_end = f_end + node_type_offsets["cooperative"]

        farmer_emb = x2[:f_end]
        coop_emb = x2[f_end:c_end]
        market_emb = x2[c_end:]

        return {
            "farmer_embeddings": farmer_emb,
            "cooperative_embeddings": coop_emb,
            "market_embeddings": market_emb,
            "credit_scores": self.credit_head(farmer_emb).squeeze(-1),
            "anomaly_scores": self.anomaly_head(x2).squeeze(-1),
        }

    def predict_credit(
        self, farmer_feats: torch.Tensor, coop_feats: torch.Tensor,
        market_feats: torch.Tensor, edge_index: torch.Tensor,
        node_type_offsets: Dict[str, int],
    ) -> Dict:
        self.eval()
        with torch.no_grad():
            out = self.forward(farmer_feats, coop_feats, market_feats, edge_index, node_type_offsets)
        return {
            "credit_scores": out["credit_scores"].tolist(),
            "anomaly_scores": out["anomaly_scores"].tolist(),
        }

    def predict_link(
        self, src_emb: torch.Tensor, dst_emb: torch.Tensor
    ) -> torch.Tensor:
        """Score potential edges between source and destination nodes."""
        self.eval()
        with torch.no_grad():
            combined = torch.cat([src_emb, dst_emb], dim=1)
            return self.link_head(combined).squeeze(-1)

    def get_num_params(self) -> int:
        return sum(p.numel() for p in self.parameters())
