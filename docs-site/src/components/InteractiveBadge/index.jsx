import React from "react";
import styles from "./styles.module.css";

export default function InteractiveBadge({ type = "interactive" }) {
  const isInteractive = type === "interactive";

  return (
    <div
      className={`${styles.badge} ${isInteractive ? styles.interactive : styles.static}`}
    >
      <span className={styles.icon}>{isInteractive ? "⚡" : "📖"}</span>
      <span className={styles.label}>
        {isInteractive ? "INTERACTIVE" : "STATIC"}
      </span>
      <span className={styles.description}>
        {isInteractive
          ? "You can modify and interact with this"
          : "Read-only content for reference"}
      </span>
    </div>
  );
}
