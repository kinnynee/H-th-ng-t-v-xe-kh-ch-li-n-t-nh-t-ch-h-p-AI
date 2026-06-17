import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page-stack">
      <section className="hero card">
        <p className="eyebrow">Project skeleton</p>
        <h1>Hệ thống đặt vé xe khách liên tỉnh tích hợp AI</h1>
        <p className="lead">
          Khung frontend ban đầu cho hành khách tìm chuyến, đặt vé và theo dõi hành trình.
        </p>
        <div className="actions">
          <Link className="button" href="#search">
            Tìm chuyến
          </Link>
        </div>
      </section>

      <section id="search" className="card">
        <h2>Tìm chuyến</h2>
        <p className="muted">
          TODO: kết nối form tìm chuyến với GraphQL Gateway sau.
        </p>
      </section>
    </main>
  );
}