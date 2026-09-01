import { formatETB } from '../constants';

export interface PriceFormulaResult {
    providerRate: number;       // Factor A: Provider Base Rate per 1000
    adminMargin: number;        // Factor B: Primora Admin Profit Margin
    resellerMultiplier: number; // Factor C: Reseller Multiplier Baseline
    unitFactor: number;         // Factor D: (Quantity / 1000)
    finalRate: number;          // A × B × C
    unitPrice: number;          // Final Rate / 1000
    quantity: number;
    subtotal: number;           // A × B × C × D
    discountPercent: number;
    discountAmount: number;
    finalTotal: number;
    perThousandEquation: string; // "A × B × C = Rate / 1k"
    totalChargeEquation: string; // "A × B × C × D = Total ETB"
}

export function calculatePriceFormula(
    serviceRate: number,
    originalRateInput?: number,
    rateMultiplierInput = 1,
    quantity = 1000,
    discountPercent = 0,
    adminMarginInput = 90
): PriceFormulaResult {
    const resellerMultiplier = rateMultiplierInput > 0 ? rateMultiplierInput : 1;
    const rawAdminMargin = adminMarginInput > 0 ? adminMarginInput : 90;
    
    // FACTOR B = ((factor b / 100) + 1)
    const adminMargin = (rawAdminMargin / 100) + 1;
    
    // Derive Provider Base Rate (Factor A) from original_rate if present, or un-dense from serviceRate
    const providerRate = originalRateInput && originalRateInput > 0
        ? originalRateInput
        : (serviceRate / resellerMultiplier);

    // Final Rate per 1k = Factor A × Factor B × Factor C
    const finalRate = providerRate * adminMargin * resellerMultiplier;

    const unitFactor = quantity / 1000;
    const unitPrice = finalRate / 1000;
    const subtotal = finalRate * unitFactor;
    const discountAmount = discountPercent > 0 ? subtotal * (discountPercent / 100) : 0;
    const finalTotal = subtotal - discountAmount;

    // Un-densed singular equation: A × B × C
    const perThousandEquation = `${formatETB(providerRate)} × ${adminMargin.toFixed(2)}x (Admin: ${rawAdminMargin}) × ${resellerMultiplier.toFixed(2)}x (Reseller) = ${formatETB(finalRate)} / 1k`;

    // Un-densed singular total equation: A × B × C × D
    const baseEquationStr = `${providerRate.toFixed(4)} × ${adminMargin.toFixed(2)} × ${resellerMultiplier.toFixed(2)} × (${quantity.toLocaleString()} ÷ 1000)`;
    
    const totalChargeEquation = discountPercent > 0
        ? `(${baseEquationStr}) - ${discountPercent}% = ${finalTotal.toFixed(4)} ETB`
        : `${baseEquationStr} = ${finalTotal.toFixed(4)} ETB`;

    return {
        providerRate,
        adminMargin,
        resellerMultiplier,
        unitFactor,
        finalRate,
        unitPrice,
        quantity,
        subtotal,
        discountPercent,
        discountAmount,
        finalTotal,
        perThousandEquation,
        totalChargeEquation,
    };
}
