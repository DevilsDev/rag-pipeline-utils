import React, { useState } from "react";
import styles from "./styles.module.css";

const COMMAND = "npm install @devilsdev/rag-pipeline-utils";

/** The install command with a copy button. */
export default function InstallCommand() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked; the command stays selectable.
    }
  };

  return (
    <div className={styles.install}>
      <span className={styles.prompt} aria-hidden="true">
        $
      </span>
      <code className={styles.command}>{COMMAND}</code>
      <button
        type="button"
        className={styles.copy}
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy install command"}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <span className={styles.status} role="status" aria-live="polite">
        {copied ? "Install command copied" : ""}
      </span>
    </div>
  );
}
