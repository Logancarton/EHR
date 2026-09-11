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
      className={`btn-order-cart ${count > 0 ? "has-orders" : ""}`}
      onClick={onClick}
      title={count > 0 ? `${count} order(s) staged in cart` : "Open Order Cart & E-Prescribing"}
    >
      <span className="cart-icon" aria-hidden="true"><Icon name="content_paste" /></span>
      <span className="cart-label">Orders</span>
      {count > 0 ? (
        <span className="cart-count-pill pulse">{count}</span>
      ) : (
        <span className="cart-count-pill empty">0</span>
      )}
    </button>
  );
}
