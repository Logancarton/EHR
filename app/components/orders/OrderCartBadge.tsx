"use client";
import Icon from "../ui/Icon";

export default function OrderCartBadge({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="btn-order-cart border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer"
      onClick={onClick}
      title={count > 0 ? `${count} order(s) staged in cart` : "Open Order Cart & E-Prescribing"}
    >
      <span className="cart-icon" aria-hidden="true"><Icon name="content_paste" /></span>
      <span className="cart-label">Orders</span>
      <span className="cart-count-badge bg-slate-100 text-slate-700 border border-slate-200 text-xs px-2 py-0.5 rounded-full font-semibold">
        {count}
      </span>
    </button>
  );
}
