"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, BusFront, FileText, Search, Ticket, User } from "lucide-react";

export default function SiteChrome({ children }) {
  const pathname = usePathname();
  const [role, setRole] = useState(null);

  useEffect(() => {
    const syncRole = () => {
      if (!localStorage.getItem("busAccessToken")) return setRole(null);
      for (const key of ["busAdminUser", "busUser"]) {
        try {
          const stored = JSON.parse(localStorage.getItem(key) ?? "null");
          if (["ADMIN", "STAFF", "CUSTOMER"].includes(stored?.role)) return setRole(stored.role);
        } catch {
          localStorage.removeItem(key);
        }
      }
      setRole(null);
    };
    syncRole();
    window.addEventListener("storage", syncRole);
    window.addEventListener("bus-auth-changed", syncRole);
    return () => {
      window.removeEventListener("storage", syncRole);
      window.removeEventListener("bus-auth-changed", syncRole);
    };
  }, []);

  const items = [
    { href: "/", label: "Trang chủ", icon: Search, active: pathname === "/" || pathname.startsWith("/routes/") || pathname.startsWith("/trips/") },
    { href: "/booking/demo", label: "Tra cứu vé", icon: Ticket, active: pathname.startsWith("/booking/") },
    { href: "/cancellation-policy", label: "Chính sách hủy", icon: FileText, active: pathname.startsWith("/cancellation-policy") },
    ...(pathname.startsWith("/admin") && ["ADMIN", "STAFF"].includes(role)
      ? [{ href: "/admin", label: "Quản trị", icon: BarChart3, active: pathname.startsWith("/admin") }]
      : [{ href: "/account", label: "Tài khoản", icon: User, active: pathname.startsWith("/account") }])
  ];

  return (
    <div className={`app-shell ${pathname.startsWith("/admin") ? "admin-shell" : "customer-shell"}`}>
      <header className={`topbar ${pathname.startsWith("/admin") ? "admin-topbar" : "customer-topbar"}`}>
        <div className="topbar-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <BusFront size={20} />
            </span>
            <span>Vé xe liên tỉnh AI</span>
          </Link>
          <nav className="nav" aria-label="Điều hướng chính">
            {items.map(({ href, label, icon: Icon, active }) => (
              <Link className={active ? "active" : ""} href={href} key={href} aria-current={active ? "page" : undefined}>
                <Icon size={18} /> <span>{label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
