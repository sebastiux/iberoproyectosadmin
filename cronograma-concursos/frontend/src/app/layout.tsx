import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AuthGate } from "@/components/AuthGate";
import { Shell } from "@/components/Shell";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif-family",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-family",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cronograma Concursos · Ibero",
  description: "Gestión de campañas y concursos — Universidad Iberoamericana",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${playfair.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <AuthGate>
            <Shell>{children}</Shell>
          </AuthGate>
        </Providers>
      </body>
    </html>
  );
}
