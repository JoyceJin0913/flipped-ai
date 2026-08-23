import day1 from "@/assets/day-scenes/day1.jpg";
import day2 from "@/assets/day-scenes/day2.jpg";
import day3 from "@/assets/day-scenes/day3.jpg";
import day4 from "@/assets/day-scenes/day4.jpg";
import day5 from "@/assets/day-scenes/day5.jpg";
import day6 from "@/assets/day-scenes/day6.jpg";
import day7 from "@/assets/day-scenes/day7.jpg";

/** Day 1–7 的公共场景主视觉；当天三个事件共用同一张图。 */
export const DAY_SCENE_IMAGES: Record<number, string> = {
  1: day1,
  2: day2,
  3: day3,
  4: day4,
  5: day5,
  6: day6,
  7: day7,
};

export function getDaySceneImage(day: number): string {
  return DAY_SCENE_IMAGES[day] ?? day1;
}
