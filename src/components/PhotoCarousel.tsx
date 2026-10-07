// Photos for one checkpoint: a horizontal snap-scroll strip, like a stack of polaroids.
// The next photo peeks in from the right and dots underneath show where you are.
import { useEffect, useRef, useState } from 'react';
import { MAX_PHOTOS } from '../data/game';
import type { Repo } from '../lib/repo';
import { PixelEmoji } from './Pixel';

function Slide({
  repo,
  refPath,
  index,
  total,
  onRemove,
}: {
  repo: Repo;
  refPath: string;
  index: number;
  total: number;
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    repo
      .photoUrl(refPath)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [repo, refPath]);
  return (
    <div className="photo-slide">
      <div className="photo-polaroid">
        {url ? (
          <img src={url} alt={`Photo ${index + 1} of ${total}`} draggable={false} />
        ) : (
          <div className="photo-loading">{failed ? 'Could not load photo' : 'Loading…'}</div>
        )}
      </div>
      <div className="photo-caption">
        <span>
          {index + 1}/{total}
        </span>
        {onRemove && (
          <button type="button" className="btn btn-ghost small" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export function PhotoCarousel({
  repo,
  photos,
  onAdd,
  onRemove,
  busy,
}: {
  repo: Repo;
  photos: string[];
  /** Omit onAdd and onRemove for a read-only strip. */
  onAdd?: () => void;
  onRemove?: (index: number) => void;
  busy?: boolean;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const canAdd = !!onAdd && photos.length < MAX_PHOTOS;
  const count = photos.length + (canAdd ? 1 : 0);

  const slideStep = () => {
    const el = stripRef.current;
    const second = el?.children[1] as HTMLElement | undefined;
    const first = el?.children[0] as HTMLElement | undefined;
    return first && second ? second.offsetLeft - first.offsetLeft : (el?.clientWidth ?? 1);
  };
  const onScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // At the far right the last slide may not reach the left edge, so snap the dot to the end.
    setActive(max > 0 && el.scrollLeft >= max - 2 ? count - 1 : Math.round(el.scrollLeft / slideStep()));
  };
  const goTo = (i: number) => {
    const el = stripRef.current;
    const child = el?.children[i] as HTMLElement | undefined;
    if (el && child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  };

  // After adding a photo, scroll to it (the new last photo).
  const prevCount = useRef(photos.length);
  useEffect(() => {
    if (photos.length > prevCount.current) goTo(photos.length - 1);
    prevCount.current = photos.length;
  }, [photos.length]);

  if (photos.length === 0 && !canAdd) return null;
  return (
    <div className="photo-carousel">
      <div className="photo-strip" ref={stripRef} onScroll={onScroll} tabIndex={0} aria-label="Photos, scroll sideways">
        {photos.map((ref, i) => (
          <Slide
            key={ref}
            repo={repo}
            refPath={ref}
            index={i}
            total={photos.length}
            onRemove={onRemove ? () => onRemove(i) : undefined}
          />
        ))}
        {canAdd && (
          <div className="photo-slide">
            <button type="button" className="photo-add" onClick={onAdd} disabled={busy}>
              <PixelEmoji emoji="📷" size={32} />
              <b>Add photo</b>
              <span>
                {photos.length}/{MAX_PHOTOS}
              </span>
            </button>
          </div>
        )}
      </div>
      {count > 1 && (
        <div className="photo-dots" role="tablist" aria-label="Photo position">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={i < photos.length ? `Photo ${i + 1}` : 'Add photo'}
              className={`photo-dot ${i === active ? 'on' : ''} ${i >= photos.length ? 'add' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
