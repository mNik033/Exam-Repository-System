import React from "react";
import PropTypes from "prop-types";

export default function FullPageSpinner({ className = "", style = {}, ...props }) {
  return (
    <div
      className={`full-page-spinner-container dot-pattern-bg ${className}`.trim()}
      style={style}
      {...props}
    >
      <div className="spinner spinner-lg" />
    </div>
  );
}

FullPageSpinner.propTypes = {
  className: PropTypes.string,
  style: PropTypes.object,
};
