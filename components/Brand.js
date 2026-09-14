export default function Brand({ className = "", href = "/" }) {
  return (
    <a className={`brand ${className}`.trim()} href={href} aria-label="Le Hibou Rusé — accueil">
      <span className="brand-mark" aria-hidden="true"><img src="/hibou.svg" alt="" /></span>
      <span className="brand-copy"><strong>Le Hibou</strong><em>Rusé</em></span>
    </a>
  );
}
