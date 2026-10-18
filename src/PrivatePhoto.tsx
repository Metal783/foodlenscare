import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { loadPrivateMedia, useBackend } from './backend';

/** Load protected media only when the existing image is near the viewport. */
export default function PrivatePhoto({ src = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const data = useBackend();
  const image = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState({ key: '', value: '' });
  const key = `${data.account?.id || ''}/${JSON.stringify(data.families.map(f => [f.id, f.status, f.records_allowed, f.profile_allowed]))}/${src}`;
  useEffect(() => {
    const target = image.current;
    if (!target || !('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [src]);
  useEffect(() => {
    if (!visible || !src.startsWith('/api/')) return;
    let active = true;
    void loadPrivateMedia(src).then(value => { if (active) setLoaded({ key, value }); }).catch(() => { if (active) setLoaded({ key, value: '' }); });
    return () => { active = false; };
  }, [src, key, visible]);
  const value = src.startsWith('/api/') ? loaded.key === key ? loaded.value : '' : src;
  return <img {...props} ref={image} loading="lazy" src={value || undefined} />;
}
