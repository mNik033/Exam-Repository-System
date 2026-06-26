import React from "react";
import PropTypes from "prop-types";
import { motion } from "motion/react";

export default function PageHeader({ label, title, description, className = "", style = {}, ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`page-header-container ${className}`.trim()}
      style={style}
      {...props}
    >
      <div className="page-header-label-row">
        <div className="page-header-accent-line" />
        <span className="serif-heading page-header-label">
          {label}
        </span>
      </div>
      <h1 className="text-display-small serif-heading page-header-title">
        {title}
      </h1>
      {description && (
        <p className="text-body-large no-margin">
          {description}
        </p>
      )}
    </motion.div>
  );
}

PageHeader.propTypes = {
  label: PropTypes.node.isRequired,
  title: PropTypes.node.isRequired,
  description: PropTypes.node,
  className: PropTypes.string,
  style: PropTypes.object,
};
