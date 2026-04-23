import './admin.css';

export const metadata = {
  title: 'Canary control',
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="adm-root">{children}</div>;
}
