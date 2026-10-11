import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/** Offline text label rendered to a canvas texture (no font download needed). */
export function TextSprite({ text, position, color = '#5d6b7c', size = 0.32 }: {
  text: string; position: [number, number, number]; color?: string; size?: number
}) {
  const { texture, aspect } = useMemo(() => {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    const font = '500 44px "IBM Plex Mono", monospace'
    let w = 64
    if (ctx) { ctx.font = font; w = Math.ceil(ctx.measureText(text).width) + 16 }
    c.width = w; c.height = 60
    if (ctx) {
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle'
      ctx.fillText(text, 8, 31)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return { texture: t, aspect: w / 60 }
  }, [text, color])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <sprite position={position} scale={[size * aspect, size, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  )
}
