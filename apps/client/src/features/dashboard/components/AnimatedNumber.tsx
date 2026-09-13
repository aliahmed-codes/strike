import { useEffect, useState } from 'react'
import { animate } from 'framer-motion'

export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString(),
}: {
  value: number
  format?: (n: number) => string
}) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1,
      ease: 'easeOut',
      onUpdate: setDisplay,
    })
    return () => controls.stop()
  }, [value])

  return <>{format(display)}</>
}
