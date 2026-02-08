'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

type LoadingPhase = "idle" | "premise" | "rules" | "format" | "slow";

type Props = {
  open: boolean;
  phase?: LoadingPhase;
  onCancel?: () => void;
};

export default function LoadingScreen({
  open,
  phase = "premise",
  onCancel,
}: Props) {
  if (!open) return null;

  const title =
    phase === "premise" ? "前提確認中…" :
    phase === "rules"   ? "ルール適用中…" :
    phase === "format"  ? "共有用に整形中…" :
    phase === "slow"    ? "最適化中…" :
                          "";

  const sub =
    phase === "premise"
      ? "入力条件が工程に正しく反映されているか確認しています"
    : phase === "rules"
      ? "入力内容に合わせた旅程ルールを適用しています"
    : phase === "format"
      ? "みんなで見て話しやすい形に整えています"
    : phase === "slow"
      ? "プランを最適化しています"
    : "";

  return (
    <div style={styles.backdrop}>
      <div style={styles.card}>
        <div style={styles.scene}>
          {/* 走る/歩くアニメ（横にスライド＋足踏み風） */}
          <div style={styles.walker}>
            <Image
              src="/cocoico-ai_chara.png"
              alt="cocoico character"
              width={150}
              height={150}
              priority
              style={{ filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.18))' }}
            />
          </div>
        </div>

        <div className="p-4 text-center">
          <div className="text-xl font-extrabold text-gray-900 tracking-wide">{title}</div>
          <div className="mt-2 text-sm leading-relaxed text-gray-500">{sub}</div>

          {onCancel && (
            <button 
              className="mt-4 px-4 py-2 bg-emerald-500 text-white font-bold rounded-full hover:bg-red-600 transition cursor-pointer"
              onClick={onCancel}
            >
              キャンセル
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(17, 24, 39, 0.55)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 9999,
    padding: 16,
  },
  card: {
    width: 'min(680px, 100%)',
    background: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0 18px 60px rgba(0,0,0,0.25)',
    border: '1px solid rgba(17,24,39,0.12)',
  },
  scene: {
    position: 'relative',
    height: 280,
    background: 'linear-gradient(180deg, #E9F7FF 0%, #FFFFFF 70%)',
    display: 'grid',
    placeItems: 'center',
  },
  walker: {
    position: 'relative',
    width: 240,
    height: 240,
    display: 'grid',
    placeItems: 'center',
    // @ts-ignore
    animation: 'slide 1.8s ease-in-out infinite, bob 0.7s ease-in-out infinite',
  },
  ground: {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '70%',
    height: 10,
    borderRadius: 999,
    background: 'rgba(17, 24, 39, 0.08)',
    filter: 'blur(0.2px)',
  },
  textArea: {
    padding: '18px 18px 20px',
  },
  title: {
    fontSize: 20,
    fontWeight: 800,
    color: '#111827',
    letterSpacing: 0.2,
  },
  sub: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 1.5,
    color: '#6B7280',
  },
  cancelBtn: {
    marginTop: 14,
    width: 'fit-content',
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid rgba(17,24,39,0.18)',
    background: '#fff',
    color: '#111827',
    fontWeight: 700,
    cursor: 'pointer',
  },
};