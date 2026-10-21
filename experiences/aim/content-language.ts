import type { MapDocument } from "../../map-model";
import { isUiLanguage, type UiLanguage } from "../../i18n";

const KANA_OR_HANGUL = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
// Common script-specific characters are evidence, not a conversion table.
// Shared characters alone cannot distinguish the scripts; ambiguous text keeps a Chinese UI choice,
// or the historical Traditional Chinese fallback when the interface is English.
const SIMPLIFIED =
  /[这么来个为们时说学体语问题现发对关开闭国东车书话与业专严两义乐习乡买乱争于亲从仓会传优伤儿兑党兰兴养写军农冲决况冻净几凤凯刘创别剂剑务动劳势区华协单卖卢卫厂历厉压县参双变叙叶号听启员园围图圆场块坚坛坝声处备复头夹夺奋奖妇妈孙宁实审宪宫宽宾导将层岁岛币师帐带帮干库应废广庄庆归录当彻忆怀态总恋恶悦惊惧惯愿戏战户执扩扫扬抢护报担拟择拥拨据换损摇摄摆数斋断无旧显晓暂术机杂权条极构枪标样桥检楼欢汉汤沟没泽洁浅测济浏浓涂润温湾湿满灯灵灾点炼热爱爷犹独献环电画疗监盖盘矿码礼种积称稳穷竞笔笼简粮纠红约级纪纯纲纳纵纷纸纹线组细织终经结给统继绩绪续维综绿编缘缝缩缴网罗职联聪肃肠肤胜胶脏脑脚脸腻节范茧药获营蓝虑虚虫虽补装裤见观规视览觉计订认让议记讲许论设访证评识诉词译试诗诚该详语误请诸读课调谈谢谐谋谱贝负财责败账货质购费贺资赋赏赔赖赞赢赵趋跃践踪转轮软轰轻载较辅辉辑输辖辽达迁过迈运还进远违连迟适选递逻遗邮邻郑酱释鉴针钢钱铁铃铸钟链销锁锻镜长门闪闭问闯闲间阀队阳阴阵阶际陆陈险随隐难雾静页顶项顺须顾顿颁预领频题颜额风飞饭饮馆饱马驱验骑鱼鲜鸟鸣鸭鹅麦黄齐齿龄龙龟]/gu;
const TRADITIONAL =
  /[這麼來個為們時說學體語問題現發對關開閉國東車書話與業專嚴兩義樂習鄉買亂爭於親從倉會傳優傷兒兌黨蘭興養寫軍農衝決況凍淨幾鳳凱劉創別劑劍務動勞勢區華協單賣盧衛廠歷厲壓縣參雙變敘葉號聽啟員園圍圖圓場塊堅壇壩聲處備復頭夾奪奮獎婦媽孫寧實審憲宮寬賓導將層歲島幣師帳帶幫庫應廢廣莊慶歸錄當徹憶懷態總戀惡悅驚懼慣願戲戰戶執擴掃揚搶護報擔擬擇擁撥據換損搖攝擺數齋斷無舊顯曉暫術機雜權條極構槍標樣橋檢樓歡漢湯溝沒澤潔淺測濟瀏濃塗潤溫灣濕滿燈靈災點煉熱愛爺猶獨獻環電畫療監蓋盤礦碼禮種積稱穩窮競筆籠簡糧糾紅約級紀純綱納縱紛紙紋線組細織終經結給統繼績緒續維綜綠編緣縫縮繳網羅職聯聰肅腸膚勝膠臟腦腳臉膩節範繭藥獲營藍慮虛蟲雖補裝褲見觀規視覽覺計訂認讓議記講許論設訪證評識訴詞譯試詩誠該詳誤請諸讀課調談謝諧謀譜貝負財責敗賬貨質購費賀資賦賞賠賴贊贏趙趨躍踐蹤轉輪軟轟輕載較輔輝輯輸轄遼達遷過邁運還進遠違連遲適選遞邏遺郵鄰鄭醬釋鑑針鋼錢鐵鈴鑄鐘鏈銷鎖鍛鏡長門閃問闖閒間閥隊陽陰陣階際陸陳險隨隱難霧靜頁頂項順須顧頓頒預領頻題顏額風飛飯飲館飽馬驅驗騎魚鮮鳥鳴鴨鵝麥黃齊齒齡龍龜]/gu;

/**
 * Character-only language detection for one piece of user text. "unsupported" means Japanese/Korean
 * (use the interface language); undefined means no decisive signal (empty, digits or emoji only).
 */
export function detectAimContentLanguage(
  text: string,
  fallback: UiLanguage = "zh-TW"
): UiLanguage | "unsupported" | undefined {
  if (KANA_OR_HANGUL.test(text)) return "unsupported";
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const latin = (text.match(/\p{Script=Latin}+/gu) ?? []).length;
  if (han > 0 && han >= latin) {
    const simplified = (text.match(SIMPLIFIED) ?? []).length;
    const traditional = (text.match(TRADITIONAL) ?? []).length;
    if (simplified !== traditional) return simplified > traditional ? "zh-CN" : "zh-TW";
    return fallback === "zh-CN" ? "zh-CN" : "zh-TW";
  }
  if (latin > 0) return "en";
  return undefined;
}

/**
 * Picks the AIM content language from the user's own words: topic first, then context, then the
 * interface language. Common-only or evenly mixed Chinese follows a Chinese UI choice, otherwise
 * Traditional Chinese for backward compatibility. No AI call and no modification of the supplied text.
 */
export function chooseAimContentLanguage(uiLanguage: UiLanguage, ...sources: (string | undefined)[]): UiLanguage {
  for (const source of sources) {
    const result = detectAimContentLanguage(source ?? "", uiLanguage);
    if (result === "unsupported") return uiLanguage;
    if (result) return result;
  }
  return uiLanguage;
}

/**
 * Content language of a saved map: the stored value, else derived from the map title (legacy maps),
 * else the interface language. Read from the map on every call; never cached by callers.
 */
export function resolveAimContentLanguage(
  map: Pick<MapDocument, "title" | "aim"> | undefined | null,
  uiLanguage: UiLanguage
): UiLanguage {
  const stored = map?.aim?.contentLanguage;
  if (isUiLanguage(stored)) return stored;
  return chooseAimContentLanguage(uiLanguage, map?.title);
}
