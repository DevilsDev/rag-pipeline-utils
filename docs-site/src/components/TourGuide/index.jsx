import React, { useState } from "react";
import styles from "./styles.module.css";

const TOUR_STEPS = [
  {
    id: "welcome",
    title: "Welcome to Interactive Tools",
    content:
      "These interactive tools help you explore RAG Pipeline Utils features hands-on. You can modify code, generate configurations, and estimate performance.",
    highlight: null,
  },
  {
    id: "code-playground",
    title: "Code Playground",
    content:
      "Try live code examples in your browser. Modify the code and click 'Open in StackBlitz' to run it in a real environment. This is INTERACTIVE - you can edit the code!",
    highlight: "playground",
  },
  {
    id: "config-generator",
    title: "Configuration Generator",
    content:
      "Build your RAG pipeline configuration step-by-step using this wizard. Select your embedder, retriever, and LLM, then copy the generated code. This is INTERACTIVE - click through the steps!",
    highlight: "generator",
  },
  {
    id: "performance-calculator",
    title: "Performance Calculator",
    content:
      "Estimate throughput, latency, and costs based on your configuration. Adjust sliders and dropdowns to see real-time cost and performance calculations. This is INTERACTIVE - try changing values!",
    highlight: "calculator",
  },
  {
    id: "educational-mode",
    title: "Educational Mode",
    content:
      "Look for the help icons throughout the tools. Hover over them to see detailed explanations of features, best practices, and tips.",
    highlight: null,
  },
];

export default function TourGuide({ onClose }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showTour, setShowTour] = useState(true);

  const nextStep = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      closeTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipTour = () => {
    closeTour();
  };

  const closeTour = () => {
    setShowTour(false);
    if (onClose) onClose();
  };

  if (!showTour) return null;

  const step = TOUR_STEPS[currentStep];

  return (
    <div className={styles.tourOverlay}>
      <div className={styles.tourModal}>
        <div className={styles.tourHeader}>
          <h3>{step.title}</h3>
          <button className={styles.closeButton} onClick={closeTour}>
            ×
          </button>
        </div>

        <div className={styles.tourBody}>
          <p>{step.content}</p>

          <div className={styles.tourProgress}>
            {TOUR_STEPS.map((s, index) => (
              <div
                key={s.id}
                className={`${styles.progressDot} ${
                  index === currentStep ? styles.active : ""
                } ${index < currentStep ? styles.completed : ""}`}
                onClick={() => setCurrentStep(index)}
              />
            ))}
          </div>
        </div>

        <div className={styles.tourFooter}>
          <button className={styles.secondaryButton} onClick={skipTour}>
            Skip Tour
          </button>
          <div className={styles.navigationButtons}>
            <button
              className={styles.navButton}
              disabled={currentStep === 0}
              onClick={prevStep}
            >
              Previous
            </button>
            <button className={styles.primaryButton} onClick={nextStep}>
              {currentStep === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
