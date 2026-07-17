import Link from "next/link";
import { BarChart3, BusFront, Search, Ticket, User } from "lucide-react";

export default function SiteChrome({ children }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <BusFront size={20} />
            </span>
            <span>Vé xe liên tỉnh AI</span>
          </Link>
          <nav className="nav">
            <Link href="/">
              <Search size={16} /> Tìm chuyến
            </Link>
            <Link href="/booking/demo">
              <Ticket size={16} /> Tra cứu vé
            </Link>
            <Link href="/account">
              <User size={16} /> Tài khoản
            </Link>
            <Link href="/admin">
              <BarChart3 size={16} /> Admin
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
