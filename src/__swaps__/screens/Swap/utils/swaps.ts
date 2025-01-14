import c from 'chroma-js';
import { globalColors } from '@/design-system';
import { ETH_COLOR, ETH_COLOR_DARK, ETH_COLOR_DARK_ACCENT, SCRUBBER_WIDTH, SLIDER_WIDTH } from '../constants';
import { chainNameFromChainId } from './chains';
import { ChainId, ChainName } from '../types/chains';
import { RainbowConfig } from '@/model/remoteConfig';
import { convertToRGBA, isColor } from 'react-native-reanimated';

// /---- 🎨 Color functions 🎨 ----/ //
//
export const opacity = (color: string, opacity: number): string => {
  return c(color).alpha(opacity).css();
};

export const getHighContrastColor = (color: string, isDarkMode: boolean) => {
  const contrast = c.contrast(color, isDarkMode ? globalColors.grey100 : globalColors.white100);

  if (contrast < (isDarkMode ? 3 : 2.5)) {
    if (isDarkMode) {
      return c(color)
        .set('hsl.l', contrast < 1.5 ? 0.88 : 0.8)
        .set('hsl.s', `*${contrast < 1.5 ? 0.75 : 0.85}`)
        .hex();
    } else {
      return c(color)
        .set('hsl.s', `*${contrast < 1.5 ? 2 : 1.2}`)
        .darken(2.5 - (contrast - (contrast < 1.5 ? 0.5 : 0)))
        .hex();
    }
  }
  return color;
};

export const getTintedBackgroundColor = (color: string, isDarkMode: boolean): string => {
  return c
    .mix(color, isDarkMode ? globalColors.grey100 : globalColors.white100, isDarkMode ? 0.9875 : 0.94)
    .saturate(isDarkMode ? 0 : -0.06)
    .hex();
};
//
// /---- END color functions ----/ //

// /---- 🟢 JS utils 🟢 ----/ //
//
export const clampJS = (value: number, lowerBound: number, upperBound: number) => {
  return Math.min(Math.max(lowerBound, value), upperBound);
};

export const countDecimalPlaces = (number: number): number => {
  const numAsString = number.toString();

  if (numAsString.includes('.')) {
    // Return the number of digits after the decimal point, excluding trailing zeros
    return numAsString.split('.')[1].replace(/0+$/, '').length;
  }

  // If no decimal point
  return 0;
};

export const findNiceIncrement = (availableBalance: number): number => {
  // We'll use one of these factors to adjust the base increment
  // These factors are chosen to:
  // a) Produce user-friendly amounts to swap (e.g., 0.1, 0.2, 0.3, 0.4…)
  // b) Limit shifts in the number of decimal places between increments
  const niceFactors = [1, 2, 10];

  // Calculate the exact increment for 100 steps
  const exactIncrement = availableBalance / 100;

  // Calculate the order of magnitude of the exact increment
  const orderOfMagnitude = Math.floor(Math.log10(exactIncrement));
  const baseIncrement = Math.pow(10, orderOfMagnitude);

  let adjustedIncrement = baseIncrement;

  // Find the first nice increment that ensures at least 100 steps
  for (let i = niceFactors.length - 1; i >= 0; i--) {
    const potentialIncrement = baseIncrement * niceFactors[i];
    if (potentialIncrement <= exactIncrement) {
      adjustedIncrement = potentialIncrement;
      break;
    }
  }

  return adjustedIncrement;
};
//
// /---- END JS utils ----/ //

// /---- 🔵 Worklet utils 🔵 ----/ //
//
export function addCommasToNumber(number: string | number) {
  'worklet';
  const numberString = number.toString();

  if (numberString.includes(',')) {
    return numberString;
  }

  if (Number(number) >= 1000) {
    const parts = numberString.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  } else {
    return numberString;
  }
}

export function clamp(value: number, lowerBound: number, upperBound: number) {
  'worklet';
  return Math.min(Math.max(lowerBound, value), upperBound);
}

export function stripCommas(value: string) {
  'worklet';
  return value.replace(/,/g, '');
}

export function trimTrailingZeros(value: string) {
  'worklet';
  const withTrimmedZeros = value.replace(/0+$/, '');
  return withTrimmedZeros.endsWith('.') ? withTrimmedZeros.slice(0, -1) : withTrimmedZeros;
}

export function valueBasedDecimalFormatter(
  amount: number,
  usdTokenPrice: number,
  roundingMode?: 'up' | 'down',
  precisionAdjustment?: number,
  isStablecoin?: boolean,
  stripSeparators = true
): string {
  'worklet';

  function calculateDecimalPlaces(usdTokenPrice: number, precisionAdjustment?: number): number {
    const fallbackDecimalPlaces = 2;
    if (usdTokenPrice <= 0) {
      return fallbackDecimalPlaces;
    }
    const unitsForOneCent = 0.01 / usdTokenPrice;
    if (unitsForOneCent >= 1) {
      return 0;
    }
    return Math.max(Math.ceil(Math.log10(1 / unitsForOneCent)) + (precisionAdjustment ?? 0), 0);
  }

  const decimalPlaces = isStablecoin ? 2 : calculateDecimalPlaces(usdTokenPrice, precisionAdjustment);

  let roundedAmount: number;
  const factor = Math.pow(10, decimalPlaces);

  // Apply rounding based on the specified rounding mode
  if (roundingMode === 'up') {
    roundedAmount = Math.ceil(amount * factor) / factor;
  } else if (roundingMode === 'down') {
    roundedAmount = Math.floor(amount * factor) / factor;
  } else {
    // Default to normal rounding if no rounding mode is specified
    roundedAmount = Math.round(amount * factor) / factor;
  }

  console.log({ decimalPlaces });

  // Format the number to add separators and trim trailing zeros
  const numberFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: !isNaN(decimalPlaces) ? decimalPlaces : 2, // Allow up to the required precision
    useGrouping: true,
  });

  if (stripSeparators) return stripCommas(numberFormatter.format(roundedAmount));

  return numberFormatter.format(roundedAmount);
}

export function niceIncrementFormatter(
  incrementDecimalPlaces: number,
  inputAssetBalance: number,
  inputAssetUsdPrice: number,
  niceIncrement: number,
  percentageToSwap: number,
  sliderXPosition: number,
  stripSeparators?: boolean
) {
  'worklet';
  if (percentageToSwap === 0) return '0';
  if (percentageToSwap === 0.25) return valueBasedDecimalFormatter(inputAssetBalance * 0.25, inputAssetUsdPrice, 'up', -3);
  if (percentageToSwap === 0.5) return valueBasedDecimalFormatter(inputAssetBalance * 0.5, inputAssetUsdPrice, 'up', -3);
  if (percentageToSwap === 0.75) return valueBasedDecimalFormatter(inputAssetBalance * 0.75, inputAssetUsdPrice, 'up', -3);
  if (percentageToSwap === 1) return valueBasedDecimalFormatter(inputAssetBalance, inputAssetUsdPrice, 'up');

  const exactIncrement = inputAssetBalance / 100;
  const isIncrementExact = niceIncrement === exactIncrement;
  const numberOfIncrements = inputAssetBalance / niceIncrement;
  const incrementStep = 1 / numberOfIncrements;
  const percentage = isIncrementExact
    ? percentageToSwap
    : Math.round(clamp((sliderXPosition - SCRUBBER_WIDTH / SLIDER_WIDTH) / SLIDER_WIDTH, 0, 1) * (1 / incrementStep)) / (1 / incrementStep);

  const rawAmount = Math.round((percentage * inputAssetBalance) / niceIncrement) * niceIncrement;
  const amountToFixedDecimals = rawAmount.toFixed(incrementDecimalPlaces);

  const formattedAmount = `${Number(amountToFixedDecimals).toLocaleString('en-US', {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  })}`;

  if (stripSeparators) return stripCommas(formattedAmount);

  return formattedAmount;
}

export const opacityWorklet = (color: string, opacity: number) => {
  'worklet';

  if (isColor(color)) {
    const rgbaColor = convertToRGBA(color);
    return `rgba(${rgbaColor[0] * 255}, ${rgbaColor[1] * 255}, ${rgbaColor[2] * 255}, ${opacity})`;
  } else {
    return color;
  }
};

//
// /---- END worklet utils ----/ //

export const DEFAULT_SLIPPAGE_BIPS = {
  [ChainId.mainnet]: 100,
  [ChainId.polygon]: 200,
  [ChainId.bsc]: 200,
  [ChainId.optimism]: 200,
  [ChainId.base]: 200,
  [ChainId.zora]: 200,
  [ChainId.arbitrum]: 200,
  [ChainId.avalanche]: 200,
};

export const DEFAULT_SLIPPAGE = {
  [ChainId.mainnet]: '1',
  [ChainId.polygon]: '2',
  [ChainId.bsc]: '2',
  [ChainId.optimism]: '2',
  [ChainId.base]: '2',
  [ChainId.zora]: '2',
  [ChainId.arbitrum]: '2',
  [ChainId.avalanche]: '2',
};

const slippageInBipsToString = (slippageInBips: number) => (slippageInBips / 100).toString();

export const getDefaultSlippage = (chainId: ChainId, config: RainbowConfig) => {
  const chainName = chainNameFromChainId(chainId) as
    | ChainName.mainnet
    | ChainName.optimism
    | ChainName.polygon
    | ChainName.arbitrum
    | ChainName.base
    | ChainName.zora
    | ChainName.bsc
    | ChainName.avalanche;
  return slippageInBipsToString(
    // NOTE: JSON.parse doesn't type the result as a Record<ChainName, number>
    (config.default_slippage_bips as unknown as Record<ChainName, number>)[chainName] || DEFAULT_SLIPPAGE_BIPS[chainId]
  );
};

export type Colors = {
  primary?: string;
  fallback?: string;
  shadow?: string;
};

export const extractColorValueForColors = ({ colors, isDarkMode }: { colors?: Colors; isDarkMode: boolean }): string => {
  'worklet';

  if (colors?.primary) {
    return colors.primary;
  }

  if (colors?.fallback) {
    return colors.fallback;
  }

  return isDarkMode ? ETH_COLOR_DARK_ACCENT : ETH_COLOR;
};
