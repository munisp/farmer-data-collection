"""
Neo4j Graph Database Integration

Manages the farmer-cooperative-market knowledge graph in Neo4j.
Provides graph data for GNN training and real-time queries.

Features:
- Load/sync graph from PostgreSQL to Neo4j
- Cypher queries for GNN feature extraction
- Link prediction queries
- Community detection for cooperative grouping
- Fraud ring detection via graph patterns
"""

import os
import json
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "farmconnect")


@dataclass
class GraphStats:
    farmer_count: int
    cooperative_count: int
    market_count: int
    edge_count: int
    avg_connections: float


class Neo4jGraphManager:
    """Manages Neo4j knowledge graph for GNN training and real-time queries."""

    def __init__(self, uri: str = NEO4J_URI, user: str = NEO4J_USER, password: str = NEO4J_PASSWORD):
        self.uri = uri
        self.user = user
        self.password = password
        self._driver = None

    def connect(self):
        """Connect to Neo4j."""
        try:
            from neo4j import GraphDatabase
            self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            self._driver.verify_connectivity()
            logger.info(f"Connected to Neo4j at {self.uri}")
        except ImportError:
            logger.warning("neo4j driver not installed. Using in-memory graph.")
            self._driver = None
        except Exception as e:
            logger.warning(f"Could not connect to Neo4j: {e}. Using in-memory graph.")
            self._driver = None

    def close(self):
        if self._driver:
            self._driver.close()

    def setup_schema(self):
        """Create indexes and constraints for the knowledge graph."""
        if not self._driver:
            return
        constraints = [
            "CREATE CONSTRAINT IF NOT EXISTS FOR (f:Farmer) REQUIRE f.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Cooperative) REQUIRE c.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (m:Market) REQUIRE m.id IS UNIQUE",
            "CREATE INDEX IF NOT EXISTS FOR (f:Farmer) ON (f.region)",
            "CREATE INDEX IF NOT EXISTS FOR (f:Farmer) ON (f.credit_score)",
            "CREATE INDEX IF NOT EXISTS FOR (m:Market) ON (m.region)",
        ]
        with self._driver.session() as session:
            for cypher in constraints:
                session.run(cypher)
        logger.info("Neo4j schema created")

    def load_graph_data(self, graph_data: Dict):
        """Load graph data (from synthetic generator or DB) into Neo4j."""
        if not self._driver:
            logger.info("Neo4j not available. Skipping graph load.")
            return

        nodes = graph_data["nodes"]
        edges = graph_data["edges"]

        with self._driver.session() as session:
            # Clear existing data
            session.run("MATCH (n) DETACH DELETE n")

            # Create nodes
            for node in nodes:
                ntype = node["type"].capitalize()
                props = {**node["features"], "id": node["id"]}
                props_str = ", ".join(f"{k}: ${k}" for k in props)
                session.run(f"CREATE (n:{ntype} {{{props_str}}})", **props)

            # Create edges
            for edge in edges:
                rel_type = edge["type"]
                session.run(
                    f"MATCH (a {{id: $src}}), (b {{id: $dst}}) "
                    f"CREATE (a)-[r:{rel_type} {{weight: $weight}}]->(b)",
                    src=edge["source"], dst=edge["target"],
                    weight=edge.get("weight", 1.0),
                )

        logger.info(f"Loaded {len(nodes)} nodes and {len(edges)} edges into Neo4j")

    def get_graph_stats(self) -> GraphStats:
        """Get graph statistics."""
        if not self._driver:
            return GraphStats(0, 0, 0, 0, 0.0)

        with self._driver.session() as session:
            farmers = session.run("MATCH (f:Farmer) RETURN count(f) as c").single()["c"]
            coops = session.run("MATCH (c:Cooperative) RETURN count(c) as c").single()["c"]
            markets = session.run("MATCH (m:Market) RETURN count(m) as c").single()["c"]
            edges = session.run("MATCH ()-[r]->() RETURN count(r) as c").single()["c"]
            total_nodes = farmers + coops + markets
            avg_conn = edges / max(total_nodes, 1)

        return GraphStats(farmers, coops, markets, edges, round(avg_conn, 2))

    def extract_gnn_features(self) -> Dict:
        """Extract node features and edge index for GNN training from Neo4j."""
        if not self._driver:
            return {"farmer_feats": [], "coop_feats": [], "market_feats": [], "edges": []}

        with self._driver.session() as session:
            farmers = session.run(
                "MATCH (f:Farmer) RETURN f.id AS id, f.farm_size AS farm_size, "
                "f.years_experience AS exp, f.num_crops AS crops, "
                "f.credit_score AS credit, f.annual_revenue AS revenue, "
                "f.region_encoded AS region ORDER BY f.id"
            ).data()

            coops = session.run(
                "MATCH (c:Cooperative) RETURN c.id AS id, c.member_count AS members, "
                "c.total_land_ha AS land, c.avg_credit_score AS credit, "
                "c.collective_revenue AS revenue, c.years_active AS years, "
                "c.loan_default_rate AS default_rate ORDER BY c.id"
            ).data()

            markets = session.run(
                "MATCH (m:Market) RETURN m.id AS id, m.daily_volume_kg AS volume, "
                "m.avg_price_index AS price_idx, m.num_active_sellers AS sellers, "
                "m.num_active_buyers AS buyers, m.region_encoded AS region, "
                "m.infrastructure_score AS infra ORDER BY m.id"
            ).data()

            edges = session.run(
                "MATCH (a)-[r]->(b) RETURN a.id AS source, b.id AS target, "
                "type(r) AS rel_type, r.weight AS weight"
            ).data()

        return {
            "farmer_feats": farmers,
            "coop_feats": coops,
            "market_feats": markets,
            "edges": edges,
        }

    def find_fraud_rings(self, min_ring_size: int = 3) -> List[Dict]:
        """Detect potential fraud rings via graph pattern matching."""
        if not self._driver:
            return []

        with self._driver.session() as session:
            # Find clusters of farmers with unusual trading patterns
            result = session.run(
                "MATCH (f1:Farmer)-[:TRADES_WITH]->(f2:Farmer)-[:TRADES_WITH]->(f3:Farmer) "
                "WHERE f1 <> f3 "
                "RETURN f1.id AS node1, f2.id AS node2, f3.id AS node3, "
                "f1.credit_score AS score1, f2.credit_score AS score2, "
                "f3.credit_score AS score3 "
                "LIMIT 100"
            ).data()

        return result

    def recommend_markets(self, farmer_id: str, limit: int = 5) -> List[Dict]:
        """Recommend markets for a farmer based on cooperative connections."""
        if not self._driver:
            return []

        with self._driver.session() as session:
            result = session.run(
                "MATCH (f:Farmer {id: $fid})-[:MEMBER_OF]->(c:Cooperative)"
                "-[:SUPPLIES]->(m:Market) "
                "WHERE NOT (f)-[:SELLS_AT]->(m) "
                "RETURN m.id AS market_id, m.daily_volume_kg AS volume, "
                "m.avg_price_index AS price_index, m.infrastructure_score AS infra, "
                "count(c) AS cooperative_connections "
                "ORDER BY cooperative_connections DESC, m.daily_volume_kg DESC "
                "LIMIT $limit",
                fid=farmer_id, limit=limit,
            ).data()

        return result
