import { useEffect } from "react";

/** 页面标识变化后回到顶部；弹窗内部滚动不受影响。 */
export function useScrollToTop(pageKey: string | number) {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pageKey]);
}
