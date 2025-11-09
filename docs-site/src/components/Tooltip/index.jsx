import React, { useState } from "react";
import styles from "./styles.module.css";

export default function Tooltip({
  children,
  content,
  educationalMode = false,
}) {
  const [visible, setVisible] = useState(false);

  if (!content) return children;

  return (
    <div className={styles.tooltipContainer}>
      <span
        className={styles.trigger}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
        {educationalMode && <span className={styles.helpIcon}>?</span>}
      </span>
      {visible && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipContent}>{content}</div>
          <div className={styles.tooltipArrow} />
        </div>
      )}
    </div>
  );
}
