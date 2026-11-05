import type { ReactNode } from "react";

export const metadata = {
  title: "Ask your documents",
  description: "Answers from your documents, checked against them.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 680,
          margin: "48px auto",
          padding: "0 16px",
          lineHeight: 1.5,
        }}
      >
        {children}
      </body>
    </html>
  );
}
