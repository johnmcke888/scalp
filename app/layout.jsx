import './globals.css';

export const metadata = {
  title: 'scalper',
  description: 'Polymarket position tracker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
