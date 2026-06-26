import React from "react";
import PropTypes from "prop-types";

export default function Input({ label, id, labelRight, className = "", style = {}, ref, ...props }) {
  return (
    <div>
      {(label || labelRight) && (
        <div className="input-label-container">
          {label ? (
            <label htmlFor={id} className="input-label">
              {label}
            </label>
          ) : <div />}
          {labelRight}
        </div>
      )}
      <input
        ref={ref}
        id={id}
        className={`input-field ${className}`.trim()}
        style={style}
        {...props}
      />
    </div>
  );
}

Input.propTypes = {
  label: PropTypes.node,
  id: PropTypes.string,
  labelRight: PropTypes.node,
  className: PropTypes.string,
  style: PropTypes.object,
};
