import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background px-8">
      <div className="text-center space-y-6 max-w-md">
        {/* Glitch-style 404 */}
        <div className="relative">
          <h1 className="text-[120px] md:text-[160px] font-bold tracking-tighter leading-none text-primary/10">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl md:text-7xl font-bold tracking-tight text-foreground">
              4
              <span className="inline-block w-12 h-12 md:w-14 md:h-14 mx-1 rounded-xl bg-primary/10 border-2 border-dashed border-primary/30 relative top-1">
                <svg className="w-full h-full p-2 text-primary/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
              </span>
              4
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Page not found</h2>
          <p className="text-muted-foreground">
            This page doesn&apos;t exist. Maybe you were looking for the APK analyzer?
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
          </svg>
          Back to APKMan
        </Link>

        <p className="text-xs text-muted-foreground/60 pt-4">
          APKMan — Client-side Android reverse engineering
        </p>
      </div>
    </div>
  );
}
