import Link from 'next/link';

const navItems = [
  { label: 'Trang chủ', href: '/' },
  { label: 'Tìm chuyến', href: '/#search' },
  { label: 'Dự án', href: '/#about' },
];

export default function SiteChrome({ children }) {
  return (
    <div className="site-shell">
      <header className="site-header">
        <strong>Hệ thống đặt vé xe khách liên tỉnh tích hợp AI</strong>
        <nav className="site-nav" aria-label="Điều hướng chính">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <p>Frontend skeleton ban đầu. TODO: mở rộng theo nhánh của từng thành viên.</p>
      </footer>
    </div>
  );
}