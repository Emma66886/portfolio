import Link from "next/link";
import { profile } from "@/lib/data";

export default function NotFound() {
  return (
    <main className="notfound">
      <div className="wrap notfound-inner">
        <p className="section-eyebrow">404</p>
        <h1>This page took a wrong turn</h1>
        <p>
          The page you&apos;re looking for doesn&apos;t exist. Head back to the homepage, or get in
          touch if you were expecting something here.
        </p>
        <div className="cta-actions">
          <Link href="/" className="btn btn-primary">
            Back to home
          </Link>
          <a href={`mailto:${profile.email}`} className="btn btn-ghost">
            Email me
          </a>
        </div>
      </div>
    </main>
  );
}
