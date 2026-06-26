import React from "react";
import PropTypes from "prop-types";
import { Loader } from "lucide-react";

export default function Button({ children, loading, type = "button", className = "", style = {}, ref, ...props }) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={loading || props.disabled}
      className={`btn-filled ${className}`.trim()}
      style={{ width: "100%", opacity: loading || props.disabled ? 0.7 : 1, ...style }}
      {...props}
    >
      {loading ? (
        <Loader size={18} className="animate-spin" />
      ) : (
        children
      )}
    </button>
  );
}

Button.propTypes = {
  children: PropTypes.node.isRequired,
  loading: PropTypes.bool,
  type: PropTypes.oneOf(["button", "submit", "reset"]),
  className: PropTypes.string,
  style: PropTypes.object,
  disabled: PropTypes.bool,
};
