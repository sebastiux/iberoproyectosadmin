"use client";

export function SupportButton() {
  return (
    <a
      href="mailto:soporte@ibero.mx?subject=Soporte%20Cronograma%20Concursos"
      aria-label="Contactar a soporte"
      title="Soporte"
      className="fixed bottom-5 right-5 z-40 flex h-10 w-10 items-center justify-center rounded-full border bg-white text-gray-500 shadow-sm opacity-60 transition hover:opacity-100 hover:border-gray-400 hover:text-gray-900"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7" />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    </a>
  );
}
