import plain from '@/assets/hearts/plain_heart.png'
import anatomical from '@/assets/hearts/anatomical_heart.png'
import angler from '@/assets/hearts/angler_heart.png'
import trex from '@/assets/hearts/trexheart.png'
import shark from '@/assets/hearts/shark.png'
import capy from '@/assets/hearts/capy.png'
import derpyCat from '@/assets/hearts/derpy_mcglurp_cat.png'
import pupKit from '@/assets/hearts/sweet_pupkit.png'
import space from '@/assets/hearts/space_heart.png'
import doley from '@/assets/hearts/doley_heart.png'
import silvery from '@/assets/hearts/silvery_heart.png'

const SPECIALS = [anatomical, angler, trex, shark, capy, derpyCat, pupKit, space, doley, silvery]

export interface PickedHeart {
  src: string
  isSpecial: boolean
}

export function pickHeart(): PickedHeart {
  if (Math.random() < 0.1) {
    return { src: SPECIALS[Math.floor(Math.random() * SPECIALS.length)], isSpecial: true }
  }
  return { src: plain, isSpecial: false }
}
