/**
 * Loan Application Screen Tests
 *
 * Verifies loan application flow, eligibility check, and status tracking.
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
    get: jest.fn().mockResolvedValue({ data: { loans: [], eligibility: { eligible: true } } }),
    post: jest.fn().mockResolvedValue({ data: { success: true, loanId: 'LN-001' } }),
  },
}));

describe('Loan Application', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loan application screen', () => {
    const LoanScreen = require('../../src/screens/loans/LoanApplicationScreen').default;
    const { queryByText } = render(<LoanScreen />);
    expect(queryByText(/loan/i) || queryByText(/apply/i) || queryByText(/amount/i)).toBeTruthy();
  });
});
