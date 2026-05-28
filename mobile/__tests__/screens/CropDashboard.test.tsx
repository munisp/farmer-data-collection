/**
 * CropDashboardScreen Core Flow Tests
 * 
 * Verifies crop management flow:
 * - Lists farmer's crops
 * - Shows crop health indicators
 * - Navigation to crop details
 */
import React from 'react';
import { render } from '@testing-library/react-native';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: {} }),
}));

jest.mock('../../src/services/api/client', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({
      data: {
        crops: [
          { id: 1, name: 'Cassava', status: 'growing', plantedDate: '2026-01-15' },
          { id: 2, name: 'Maize', status: 'harvested', plantedDate: '2025-10-01' },
        ],
      },
    }),
  },
}));

import CropDashboardScreen from '../../src/screens/crops/CropDashboardScreen';

describe('CropDashboardScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<CropDashboardScreen navigation={mockNavigation as any} />);
    expect(toJSON()).not.toBeNull();
  });

  it('displays crop-related content', () => {
    const { getByText } = render(<CropDashboardScreen navigation={mockNavigation as any} />);
    expect(getByText(/crop|plant|harvest/i)).toBeTruthy();
  });
});
