import Link from 'next/link';
import TripSearchForm from '../components/TripSearchForm';

const steps = [
  {
    title: 'Tìm chuyến',
    description: 'Nhập điểm đi, điểm đến và ngày đi để xem chuyến phù hợp.',
  },
  {
    title: 'Chọn ghế',
    description: 'Quan sát sơ đồ ghế đơn giản và chọn ghế còn trống.',
  },
  {
    title: 'Thanh toán và nhận vé',
    description: 'Hoàn tất thanh toán, nhận mã vé và theo dõi trạng thái.',
  },
];

export default function HomePage() {
  return (
    <main className="page-stack">
      <section className="hero card">
        <p className="eyebrow">Frontend người dùng</p>
        <h1>Hệ thống đặt vé xe khách liên tỉnh tích hợp AI</h1>
        <p className="lead">
          Khung frontend ban đầu cho hành khách tìm chuyến, chọn ghế và theo dõi booking.
        </p>
        <div className="actions">
          <Link className="button" href="#search">
            Tìm chuyến
          </Link>
        </div>
      </section>

      <section id="search" className="card">
        <h2>Tìm chuyến</h2>
        <TripSearchForm />
      </section>

      <section className="card">
        <h2>3 bước cơ bản</h2>
        <div className="steps-grid">
          {steps.map((step, index) => (
            <article key={step.title} className="step-card">
              <span className="step-index">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}