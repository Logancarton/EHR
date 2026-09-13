"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

interface Transaction {
  id: string;
  date: string;
  description: string;
  source: "Stripe" | "QuickBooks" | "Insurance EFT" | "Patient Copay";
  amount: number;
  status: "cleared" | "pending" | "processing";
  bankAccount: string;
}

const TRANSACTIONS: Transaction[] = [
  {
    id: "tx-501",
    date: "Today, 06:00 AM",
    description: "Daily Stripe Merchant Payout (Credit card copays & self-pay fees)",
    source: "Stripe",
    amount: 1480.0,
    status: "cleared",
    bankAccount: "Chase Commercial Checking (...4921)",
  },
  {
    id: "tx-500",
    date: "Yesterday",
    description: "EFT Remittance: Blue Cross Blue Shield Batch #8819",
    source: "Insurance EFT",
    amount: 3240.5,
    status: "cleared",
    bankAccount: "Chase Commercial Checking (...4921)",
  },
  {
    id: "tx-499",
    date: "Sep 11, 2026",
    description: "Patient Copay (Elena Rostova - 99214 visit copay)",
    source: "Patient Copay",
    amount: 35.0,
    status: "cleared",
    bankAccount: "Stripe Balance",
  },
  {
    id: "tx-498",
    date: "Sep 10, 2026",
    description: "QuickBooks Journal Entry: Monthly Medical Malpractice Premium",
    source: "QuickBooks",
    amount: -680.0,
    status: "cleared",
    bankAccount: "Chase Commercial Checking (...4921)",
  },
  {
    id: "tx-497",
    date: "Sep 09, 2026",
    description: "EFT Remittance: UnitedHealthcare Optum Batch #7742",
    source: "Insurance EFT",
    amount: 2190.0,
    status: "cleared",
    bankAccount: "Chase Commercial Checking (...4921)",
  },
];

export default function FinancialIntegrationWorkspace() {
  const [transactions, setTransactions] = useState<Transaction[]>(TRANSACTIONS);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const handleSyncNow = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setSyncNotice("Synced 12 transactions from QuickBooks Online & Stripe API");
      setTimeout(() => setSyncNotice(null), 3500);
    }, 1200);
  };

  return (
    <div className="practice-subworkspace financial-workspace">
      {syncNotice && (
        <div className="practice-banner-success">
          <Icon name="check_circle" /> {syncNotice}
        </div>
      )}

      <div className="workspace-page-header">
        <div>
          <h2>Financial Integration, Banking &amp; Accounting Hub</h2>
          <p>Real-time ledger sync between EHR clinical claims, QuickBooks Online, Stripe merchant processing, and Chase commercial banking.</p>
        </div>
        <div className="header-actions">
          <Button
            size="sm"
            icon="sync"
            onClick={handleSyncNow}
            loading={syncing}
            loadingLabel="Syncing API..."
          >
            Sync QuickBooks &amp; Stripe
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="billing-metrics-grid">
        <div className="billing-metric-card">
          <span className="metric-label">Monthly Gross Revenue</span>
          <span className="metric-value" style={{ color: "var(--success)" }}>$42,850.00</span>
          <span className="metric-sub">+14% vs. previous month</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">Stripe Merchant Available</span>
          <span className="metric-value">$3,415.50</span>
          <span className="metric-sub">Auto-payout scheduled for tomorrow</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">QuickBooks Sync Status</span>
          <span className="metric-value" style={{ color: "var(--primary)" }}>Connected</span>
          <span className="metric-sub">Chart of accounts 100% reconciled</span>
        </div>
        <div className="billing-metric-card">
          <span className="metric-label">Operating Bank Balance</span>
          <span className="metric-value">$89,420.18</span>
          <span className="metric-sub">Chase Commercial (...4921)</span>
        </div>
      </div>

      {/* Main Financial Tables & Status */}
      <div className="financial-layout-grid">
        {/* Sync Integrations Status */}
        <div className="integrations-status-card">
          <h3>Connected Financial Gateways</h3>
          <div className="gateway-list">
            <div className="gateway-item">
              <div className="gateway-logo">QB</div>
              <div className="gateway-info">
                <strong>QuickBooks Online (Advanced)</strong>
                <p>Auto-reconciles insurance claim batches, clinic payroll, and practice overhead expenses.</p>
                <span className="gateway-badge connected">Live Sync Active</span>
              </div>
            </div>

            <div className="gateway-item">
              <div className="gateway-logo">S</div>
              <div className="gateway-info">
                <strong>Stripe Terminal &amp; Healthcare Billing</strong>
                <p>Processes patient copays, credit card on file, HSA/FSA cards, and daily deposits.</p>
                <span className="gateway-badge connected">Live Processing (0.8% failure rate)</span>
              </div>
            </div>

            <div className="gateway-item">
              <div className="gateway-logo">CH</div>
              <div className="gateway-info">
                <strong>Chase Commercial Operating Account</strong>
                <p>Payer EFT direct deposits and automated payroll funding.</p>
                <span className="gateway-badge connected">ACH Direct Feed Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Ledger Feed */}
        <div className="ledger-table-card">
          <div className="ledger-header">
            <h3>Recent Banking &amp; Merchant Transactions</h3>
            <span>Last synced: 14 mins ago</span>
          </div>

          <table className="billing-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Source</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.date}</td>
                  <td>
                    <div className="tx-desc">{tx.description}</div>
                    <small className="tx-acct">{tx.bankAccount}</small>
                  </td>
                  <td>
                    <span className="source-badge">{tx.source}</span>
                  </td>
                  <td>
                    <strong style={{ color: tx.amount > 0 ? "var(--success)" : "var(--error)" }}>
                      {tx.amount > 0 ? `+$${tx.amount.toFixed(2)}` : `-$${Math.abs(tx.amount).toFixed(2)}`}
                    </strong>
                  </td>
                  <td>
                    <span className="claim-status-badge status-paid">{tx.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
