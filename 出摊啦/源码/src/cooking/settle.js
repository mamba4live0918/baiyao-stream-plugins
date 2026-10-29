/* 出摊啦 · 设计v0.5纯结算。一单底价，数量差额不参与心情打折。 */
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const amount = (value, fallback) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
const fraction = (value, fallback) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
const money = value => Math.round((value + Number.EPSILON) * 100) / 100 || 0;
const defaultDiscounts = Object.freeze({ happy: 1, neutral: 1, impatient: 0.8, angry: 0.5 });
const defaultProbabilities = Object.freeze([0.15, 0.4, 0.7]);

/**
 * @param {{wanted:number,given:number,mood?:string,ruined?:boolean,sloppy?:boolean,byHelper?:boolean,rng?:()=>number}} input
 * @param {{baseCoins?:number,differenceCoins?:number,fine?:number,ruinedCoins?:number,shortProbabilities?:number[],discounts?:object}} options
 */
export function settle(input, options = {}) {
  const order = object(input), config = object(options);
  const wanted = order.wanted;
  const given = order.byHelper && !order.ruined ? wanted : order.given;
  if (!Number.isSafeInteger(wanted) || wanted < 1 || !Number.isSafeInteger(given) || given < 0) {
    throw new RangeError('wanted须为正整数，given须为非负整数');
  }
  const baseCoins = amount(config.baseCoins, 15);
  const differenceCoins = amount(config.differenceCoins, 3);
  const fine = amount(config.fine, 10);
  const shortage = Math.max(0, wanted - given), excess = Math.max(0, given - wanted);
  const result = (income, deduction, reaction, stamp, caught = false) => {
    income = money(income);
    deduction = money(deduction);
    const coins = money(income - deduction);
    return { coins, reaction, stamp, caught, wanted, given, income, deduction, net: coins, badReview: caught, text: reaction, shortage, excess };
  };

  if (order.ruined) return result(amount(config.ruinedCoins, 0), 0, '黑暗料理', 'dark');
  if (order.byHelper) return result(baseCoins, 0, '好吃！', 'good');

  if (shortage) {
    const index = Math.min(shortage, 3) - 1;
    const probability = fraction(config.shortProbabilities?.[index], defaultProbabilities[index]);
    const rng = typeof order.rng === 'function' ? order.rng : Math.random;
    if (rng() < probability) return result(0, fine, `说好的 ${wanted} 份呢！`, 'bad', true);
  }

  const mood = order.mood ?? 'happy';
  const discount = fraction(object(config.discounts)[mood], fraction(defaultDiscounts[mood], 1));
  const income = baseCoins * discount + shortage * differenceCoins;
  const deduction = excess * differenceCoins;
  const reaction = order.sloppy ? '凑合' : excess ? '赚到了！' : '好吃！';
  return result(income, deduction, reaction, excess ? 'extra' : 'good');
}
