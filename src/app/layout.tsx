import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Desempeño comercial — PIXEL.play",
  description: "Dashboard de ventas y evaluación mensual del equipo comercial.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
