import './globals.css';

export const metadata = {
  title: 'FLOW//SECTOR',
  description: 'US equity rotation monitor',
};

export default function RootLayout({ children }) {
  return <html lang="en"><body className="app-body">{children}</body></html>;
}
