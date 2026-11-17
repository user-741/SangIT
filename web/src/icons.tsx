import type { ReactNode } from "react";

const svg = (d: ReactNode, size = 20) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{d}</svg>
);

export const PlayIcon = ({ size }: { size?: number }) => svg(<path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.8-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />, size);
export const PauseIcon = ({ size }: { size?: number }) => svg(<><rect x="6" y="4.5" width="4.2" height="15" rx="1.2" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" /></>, size);
export const PrevIcon = ({ size }: { size?: number }) => svg(<><rect x="5" y="5" width="2.4" height="14" rx="1" /><path d="M19 6.1v11.8a.8.8 0 0 1-1.25.66L9.2 12.66a.8.8 0 0 1 0-1.32l8.55-5.9A.8.8 0 0 1 19 6.1Z" /></>, size);
export const NextIcon = ({ size }: { size?: number }) => svg(<><rect x="16.6" y="5" width="2.4" height="14" rx="1" /><path d="M5 6.1v11.8a.8.8 0 0 0 1.25.66l8.55-5.9a.8.8 0 0 0 0-1.32l-8.55-5.9A.8.8 0 0 0 5 6.1Z" /></>, size);
export const ShuffleIcon = ({ size }: { size?: number }) => svg(<path d="M16 3h5v5l-1.8-1.8-4.1 4.1-1.4-1.4 4.1-4.1L16 3ZM3 6h4.2c1 0 1.9.5 2.5 1.3l7.5 10.4H21v2h-3.8c-1 0-1.9-.5-2.5-1.3L7.2 8H3V6Zm13 15 1.8-1.8-3.6-3.6 1.4-1.4 3.6 3.6L21 16v5h-5ZM3 18v-2h4.2c.5 0 1-.2 1.3-.6l1.2-1.6 1.2 1.7-1 1.4c-.7.7-1.6 1.1-2.7 1.1H3Z" />, size);
export const SearchIcon = ({ size }: { size?: number }) => svg(<path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" />, size);
export const VolumeIcon = ({ size }: { size?: number }) => svg(<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4Zm11.5-1.2a5 5 0 0 1 0 7.4l-1.2-1.4a3.1 3.1 0 0 0 0-4.6l1.2-1.4Zm2.4-2.4a8.2 8.2 0 0 1 0 12.2l-1.2-1.4a6.3 6.3 0 0 0 0-9.4l1.2-1.4Z" />, size);
export const LibraryIcon = ({ size }: { size?: number }) => svg(<path d="M4 4h2.5v16H4V4Zm4.5 0H11v16H8.5V4Zm4.7 1.6 2.4-.7 4.3 15-2.4.7-4.3-15Z" />, size);
export const ListIcon = ({ size }: { size?: number }) => svg(<path d="M4 6h12v2H4V6Zm0 5h12v2H4v-2Zm0 5h8v2H4v-2Zm14-9.5V15a3 3 0 1 1-2-2.8V6.5l5-1.4V8l-3 .8Z" />, size);
export const SignOutIcon = ({ size }: { size?: number }) => svg(<path d="M10 4v2H5v12h5v2H3V4h7Zm6.6 4.6L21 13l-4.4 4.4-1.4-1.4 2-2H9v-2h8.2l-2-2 1.4-1.4Z" />, size);

export function Equalizer({ active }: { active: boolean }) {
  return (
    <span className={`eq${active ? " on" : ""}`} aria-hidden="true">
      <i /><i /><i />
    </span>
  );
}
