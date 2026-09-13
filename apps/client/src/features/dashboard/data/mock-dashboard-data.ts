/**
 * MOCK DATA — FEATURES.md item #8.
 *
 * Everything in this file is a placeholder for the Monday demo. It exists
 * so the dashboard has something to render before Quoting's real backend
 * (item #4) and the corridor catalog (item #6) exist. The shapes below are
 * intentionally what the real API responses should look like, so wiring in
 * real data later is a change to the hooks in ../api/, not to these types
 * or to any component.
 */

export interface RevenueBreakdownItem {
  label: string
  amount: number
}

export interface RegionPerformance {
  region: string
  volume: number
  transactions: number
  growthPercent: number
}

export interface PaymentMetrics {
  totalVolume: number
  totalTransactions: number
  averageTransactionValue: number
  fxMargin: number
  fxMarginPercent: number
  takeRatePercent: number
  revenueBreakdown: RevenueBreakdownItem[]
  performanceByRegion: RegionPerformance[]
}

export interface TopCorridor {
  region: string
  country: string
  service: string
  volume: number
  growthPercent: number
}

export interface RecentActivation {
  country: string
  service: string
  date: string
  status: 'active' | 'pending'
}

export interface ServiceDistributionItem {
  label: string
  percent: number
}

export interface CorridorStatus {
  activeCorridors: number
  pendingActivation: number
  serviceTypes: number
  topCorridors: TopCorridor[]
  recentActivations: RecentActivation[]
  serviceDistribution: ServiceDistributionItem[]
}

export const mockPaymentMetrics: PaymentMetrics = {
  totalVolume: 6_000_000,
  totalTransactions: 20_000,
  averageTransactionValue: 300,
  fxMargin: 120_000,
  fxMarginPercent: 2.0,
  takeRatePercent: 2.87,
  revenueBreakdown: [
    { label: 'Transaction Fees', amount: 52_240 },
    { label: 'FX Margin', amount: 120_000 },
    { label: 'Monthly Fees', amount: 72_000 },
    { label: 'Setup Fees', amount: 100_000 },
  ],
  performanceByRegion: [
    { region: 'Africa', volume: 1_200_000, transactions: 4_000, growthPercent: 15 },
    { region: 'Asia', volume: 1_800_000, transactions: 6_000, growthPercent: 8 },
    { region: 'Europe', volume: 1_500_000, transactions: 5_000, growthPercent: 5 },
    { region: 'Americas', volume: 1_500_000, transactions: 5_000, growthPercent: 12 },
  ],
}

export const mockCorridorStatus: CorridorStatus = {
  activeCorridors: 28,
  pendingActivation: 7,
  serviceTypes: 4,
  topCorridors: [
    { region: 'Africa', country: 'Nigeria', service: 'Mobile Wallet', volume: 324_500, growthPercent: 12 },
    { region: 'Asia', country: 'India', service: 'Bank Account', volume: 256_780, growthPercent: 8 },
    { region: 'Europe', country: 'United Kingdom', service: 'Card', volume: 198_320, growthPercent: 5 },
  ],
  recentActivations: [
    { country: 'Kenya', service: 'M-Pesa', date: '2025-04-12', status: 'active' },
    { country: 'Philippines', service: 'GCash', date: '2025-04-08', status: 'active' },
    { country: 'Mexico', service: 'Bank Transfer', date: '2025-04-05', status: 'pending' },
  ],
  serviceDistribution: [
    { label: 'Bank Account', percent: 42 },
    { label: 'Mobile Wallet', percent: 35 },
    { label: 'Card', percent: 18 },
    { label: 'Cash Pickup', percent: 5 },
  ],
}
