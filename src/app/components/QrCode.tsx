import { toDataURL } from 'qrcode';
import { useEffect, useState } from 'react';

/** A QR code for `value`, rendered as an image. */
export function QrCode({ value, size = 240 }: { value: string; size?: number }) {
	const [src, setSrc] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
			.then((url) => {
				if (!cancelled) setSrc(url);
			})
			.catch(() => {
				if (!cancelled) setSrc(null);
			});
		return () => {
			cancelled = true;
		};
	}, [value, size]);

	return src ? (
		<img className="qr" src={src} width={size} height={size} alt={`QR code for ${value}`} />
	) : (
		<div className="qr" style={{ width: size, height: size }} aria-hidden />
	);
}
