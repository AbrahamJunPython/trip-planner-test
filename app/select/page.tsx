'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { StepContainer } from '../components/StepContainer'
import { Step } from '../types'

const stepFromQuery = (v?: string): Step =>
  v === 'genre' || v === 'confirm' ? v : 'area'

export default function SelectPage() {
  const params = useSearchParams()
  const router = useRouter()

  const step = stepFromQuery(params.get('step'))
  const area = params.get('area') ?? undefined
  const genre = params.get('genre') ?? undefined

  const goNext = (value: string) => {
    const q = new URLSearchParams(params.toString())

    if (step === 'area') {
      q.set('area', value)
      q.set('step', 'genre')
    } else if (step === 'genre') {
      q.set('genre', value)
      q.set('step', 'confirm')
    }

    router.replace(`/select?${q.toString()}`)
  }

  if (step === 'confirm') {
    router.replace(`/result?area=${area}&genre=${genre}`)
    return null
  }

  return (
    <StepContainer
      step={step}
      state={{ step, area, genre }}
      onSelect={goNext}
    />
  )
}
