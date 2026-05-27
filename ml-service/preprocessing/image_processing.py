"""
Image preprocessing for IBM Granite Geospatial models
Handles resizing, normalization, and multi-band stacking
"""
import numpy as np
import torch
from PIL import Image
from typing import Tuple


class GranitePreprocessor:
    """Preprocessor for Granite Geospatial models"""
    
    def __init__(self, target_size: Tuple[int, int] = (512, 512)):
        """
        Initialize preprocessor
        
        Args:
            target_size: Target image size (height, width) for model input
        """
        self.target_size = target_size
    
    def prepare_flood_detection_input(self,
                                     sentinel2_data: np.ndarray,
                                     sentinel1_data: np.ndarray) -> torch.Tensor:
        """
        Prepare input tensor for flood detection model
        
        Combines Sentinel-2 and Sentinel-1 data into a 9-channel input:
        - Channels 0-5: Sentinel-2 (Blue, Green, Red, NIR, SWIR1, SWIR2)
        - Channels 6-7: Sentinel-1 (VV, VH)
        - Channel 8: Cloud Mask
        
        Args:
            sentinel2_data: Sentinel-2 imagery (H, W, 7)
            sentinel1_data: Sentinel-1 SAR imagery (H, W, 2)
            
        Returns:
            torch.Tensor with shape (1, 9, 512, 512)
        """
        # Resize Sentinel-2 to target size
        s2_resized = self._resize_multiband(sentinel2_data, self.target_size)
        
        # Resize Sentinel-1 to target size
        s1_resized = self._resize_multiband(sentinel1_data, self.target_size)
        
        # Stack all bands: 9 channels total
        # S2: B, G, R, NIR, SWIR1, SWIR2 (6 bands)
        # S1: VV, VH (2 bands)
        # S2: Cloud Mask (1 band)
        combined = np.concatenate([
            s2_resized[:, :, :6],   # Sentinel-2 optical bands
            s1_resized,              # Sentinel-1 SAR bands
            s2_resized[:, :, 6:7]   # Cloud mask
        ], axis=2)
        
        # Convert to tensor: (H, W, C) -> (C, H, W)
        tensor = torch.from_numpy(combined).permute(2, 0, 1).float()
        
        # Add batch dimension: (C, H, W) -> (1, C, H, W)
        return tensor.unsqueeze(0)
    
    def prepare_biomass_input(self, sentinel2_data: np.ndarray) -> torch.Tensor:
        """
        Prepare input tensor for biomass estimation model
        
        Args:
            sentinel2_data: Sentinel-2 imagery (H, W, 7)
            
        Returns:
            torch.Tensor with shape (1, 6, 512, 512)
        """
        # Resize to target size
        s2_resized = self._resize_multiband(sentinel2_data, self.target_size)
        
        # Use only optical bands (exclude cloud mask)
        optical_bands = s2_resized[:, :, :6]
        
        # Convert to tensor
        tensor = torch.from_numpy(optical_bands).permute(2, 0, 1).float()
        
        # Add batch dimension
        return tensor.unsqueeze(0)
    
    def prepare_canopy_height_input(self, sentinel2_data: np.ndarray) -> torch.Tensor:
        """
        Prepare input tensor for canopy height estimation model
        
        Args:
            sentinel2_data: Sentinel-2 imagery (H, W, 7)
            
        Returns:
            torch.Tensor with shape (1, 6, 512, 512)
        """
        return self.prepare_biomass_input(sentinel2_data)
    
    def prepare_land_surface_temp_input(self, sentinel2_data: np.ndarray) -> torch.Tensor:
        """
        Prepare input tensor for land surface temperature model
        
        Args:
            sentinel2_data: Sentinel-2 imagery (H, W, 7)
            
        Returns:
            torch.Tensor with shape (1, 6, 512, 512)
        """
        return self.prepare_biomass_input(sentinel2_data)
    
    def _resize_multiband(self, data: np.ndarray, target_size: Tuple[int, int]) -> np.ndarray:
        """
        Resize multi-band imagery to target size
        
        Args:
            data: Multi-band image array (H, W, C)
            target_size: Target size (height, width)
            
        Returns:
            Resized array with shape (target_height, target_width, C)
        """
        if data.ndim == 2:
            # Single band image
            img = Image.fromarray(data.astype(np.float32))
            resized = img.resize((target_size[1], target_size[0]), Image.BILINEAR)
            return np.array(resized)
        
        # Multi-band image
        num_bands = data.shape[2]
        resized_bands = []
        
        for i in range(num_bands):
            band = data[:, :, i].astype(np.float32)
            img = Image.fromarray(band)
            resized = img.resize((target_size[1], target_size[0]), Image.BILINEAR)
            resized_bands.append(np.array(resized))
        
        return np.stack(resized_bands, axis=2)
    
    def normalize_tensor(self, tensor: torch.Tensor,
                        mean: Tuple[float, ...] = None,
                        std: Tuple[float, ...] = None) -> torch.Tensor:
        """
        Normalize tensor using mean and std
        
        Args:
            tensor: Input tensor (B, C, H, W)
            mean: Mean values for each channel
            std: Standard deviation for each channel
            
        Returns:
            Normalized tensor
        """
        if mean is None or std is None:
            # Use default normalization (0-1 range)
            return tensor
        
        mean_tensor = torch.tensor(mean).view(1, -1, 1, 1)
        std_tensor = torch.tensor(std).view(1, -1, 1, 1)
        
        return (tensor - mean_tensor) / std_tensor
    
    def denormalize_tensor(self, tensor: torch.Tensor,
                          mean: Tuple[float, ...],
                          std: Tuple[float, ...]) -> torch.Tensor:
        """
        Denormalize tensor using mean and std
        
        Args:
            tensor: Normalized tensor (B, C, H, W)
            mean: Mean values used for normalization
            std: Standard deviation values used for normalization
            
        Returns:
            Denormalized tensor
        """
        mean_tensor = torch.tensor(mean).view(1, -1, 1, 1)
        std_tensor = torch.tensor(std).view(1, -1, 1, 1)
        
        return (tensor * std_tensor) + mean_tensor


class PostProcessor:
    """Post-processing utilities for model outputs"""
    
    @staticmethod
    def segmentation_to_mask(logits: torch.Tensor, threshold: float = 0.5) -> np.ndarray:
        """
        Convert segmentation logits to binary mask
        
        Args:
            logits: Model output logits (B, C, H, W)
            threshold: Threshold for binary classification
            
        Returns:
            Binary mask as numpy array
        """
        # Apply softmax to get probabilities
        probs = torch.softmax(logits, dim=1)
        
        # Get predicted class (argmax)
        predictions = torch.argmax(probs, dim=1)
        
        return predictions.cpu().numpy()
    
    @staticmethod
    def calculate_area_percentage(mask: np.ndarray, target_class: int = 1) -> float:
        """
        Calculate percentage of pixels belonging to target class
        
        Args:
            mask: Binary or multi-class mask
            target_class: Class ID to calculate percentage for
            
        Returns:
            Percentage of pixels (0-100)
        """
        total_pixels = mask.size
        target_pixels = np.sum(mask == target_class)
        return (target_pixels / total_pixels) * 100
    
    @staticmethod
    def get_confidence_map(logits: torch.Tensor) -> np.ndarray:
        """
        Get confidence map from model logits
        
        Args:
            logits: Model output logits (B, C, H, W)
            
        Returns:
            Confidence map as numpy array (0-1)
        """
        probs = torch.softmax(logits, dim=1)
        confidence = torch.max(probs, dim=1)[0]
        return confidence.cpu().numpy()
    
    @staticmethod
    def overlay_mask_on_image(image: np.ndarray,
                             mask: np.ndarray,
                             alpha: float = 0.5,
                             color: Tuple[int, int, int] = (255, 0, 0)) -> np.ndarray:
        """
        Overlay segmentation mask on RGB image
        
        Args:
            image: RGB image (H, W, 3)
            mask: Binary mask (H, W)
            alpha: Transparency of overlay (0-1)
            color: RGB color for mask overlay
            
        Returns:
            Image with mask overlay
        """
        # Ensure image is uint8
        if image.dtype != np.uint8:
            image = (image * 255).astype(np.uint8)
        
        # Create colored mask
        colored_mask = np.zeros_like(image)
        colored_mask[mask == 1] = color
        
        # Blend image and mask
        overlaid = image.copy()
        overlaid[mask == 1] = (
            alpha * colored_mask[mask == 1] +
            (1 - alpha) * image[mask == 1]
        ).astype(np.uint8)
        
        return overlaid
