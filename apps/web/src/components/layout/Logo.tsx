export function Logo({ size = 36, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/favicon.svg" width={size} height={size} alt="" className="rounded-xl shadow-glow" />
      {withText && (
        <span className="font-display text-2xl font-semibold leading-none">
          Learn <span className="text-gold-gradient">Chants</span>
        </span>
      )}
    </span>
  );
}
