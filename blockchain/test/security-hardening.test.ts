import {expect} from 'chai';
import {network} from 'hardhat';
import {A7A5_MAX_ROUNDING_ERROR, checkRoundingError} from './helpers.js';

const conn = await network.create('hardhat');
const {ethers, networkHelpers} = conn;
const {loadFixture} = networkHelpers;

const BUY = 0n;
const SELL = 1n;
const FEE = 3_000;
const UNIT = 10n ** 6n;
const DEADLINE = 4_000_000_000n;

async function deploySecurityFixture() {
  const [owner, trader, recipient, attacker] = await ethers.getSigners();

  const a7a5 = await ethers.deployContract('MockSwapToken', ['A7A5', 'A7A5', 6]);
  const usdt = await ethers.deployContract('MockSwapToken', ['USDT', 'USDT', 6]);
  const other = await ethers.deployContract('MockSwapToken', ['Other', 'OTHER', 6]);
  const wa7a5 = await ethers.deployContract('MockWrappedSwapToken', [await a7a5.getAddress(), 6]);
  const pair = await ethers.deployContract('MockSecurityV2Pair', [await a7a5.getAddress(), await usdt.getAddress()]);
  const router = await ethers.deployContract('MockSecurityV3Router');
  const quoter = await ethers.deployContract('MockSecurityQuoter');

  await Promise.all([
    a7a5.waitForDeployment(),
    usdt.waitForDeployment(),
    other.waitForDeployment(),
    wa7a5.waitForDeployment(),
    pair.waitForDeployment(),
    router.waitForDeployment(),
    quoter.waitForDeployment(),
  ]);

  await (router as any).setExpectedFee(FEE);
  await (quoter as any).setExpectedFee(FEE);

  const reserve = 1_000_000n * UNIT;
  await (a7a5 as any).mint(await pair.getAddress(), reserve);
  await (usdt as any).mint(await pair.getAddress(), reserve);
  await (pair as any).setReserves(reserve, reserve);

  // Back unwraps and fund each V3 output token. The router mints output in these mocks.
  await (a7a5 as any).mint(await wa7a5.getAddress(), reserve);

  const facade = await ethers.deployContract('PoolsFacade', [
    await wa7a5.getAddress(),
    await a7a5.getAddress(),
    await usdt.getAddress(),
    await pair.getAddress(),
    await router.getAddress(),
    await quoter.getAddress(),
    FEE,
    await owner.getAddress(),
  ]);
  await facade.waitForDeployment();

  const paraSwap = await ethers.deployContract('ParaSwap', [await facade.getAddress(), await router.getAddress(), await owner.getAddress()]);
  await paraSwap.waitForDeployment();

  const traderAddress = await trader.getAddress();
  await (a7a5 as any).mint(traderAddress, 100_000n * UNIT);
  await (usdt as any).mint(traderAddress, 100_000n * UNIT);
  await (other as any).mint(traderAddress, 100_000n * UNIT);
  await (wa7a5 as any).mint(traderAddress, 100_000n * UNIT);

  return {owner, trader, recipient, attacker, a7a5, usdt, other, wa7a5, pair, router, quoter, facade, paraSwap};
}

async function approve(token: any, signer: any, spender: any, amount: bigint) {
  await token.connect(signer).approve(await spender.getAddress(), amount);
}

describe('PoolsFacade / ParaSwap security (unit)', function () {
  // ── Constructor / admin ─────────────────────────────────────────────────────

  describe('constructor guards', function () {
    it('PoolsFacade rejects a zero WA7A5', async function () {
      const {owner, a7a5, usdt, pair, router, quoter} = await loadFixture(deploySecurityFixture);
      const factory = await ethers.getContractFactory('PoolsFacade');
      await expect(
        (factory as any).deploy(
          ethers.ZeroAddress,
          await a7a5.getAddress(),
          await usdt.getAddress(),
          await pair.getAddress(),
          await router.getAddress(),
          await quoter.getAddress(),
          FEE,
          await owner.getAddress(),
        ),
      ).to.be.revertedWithCustomError({interface: factory.interface} as any, 'PoolsFacade__ZeroAddress');
    });

    it('PoolsFacade rejects a zero A7A5', async function () {
      const {owner, usdt, wa7a5, pair, router, quoter} = await loadFixture(deploySecurityFixture);
      const factory = await ethers.getContractFactory('PoolsFacade');
      await expect(
        (factory as any).deploy(
          await wa7a5.getAddress(),
          ethers.ZeroAddress,
          await usdt.getAddress(),
          await pair.getAddress(),
          await router.getAddress(),
          await quoter.getAddress(),
          FEE,
          await owner.getAddress(),
        ),
      ).to.be.revertedWithCustomError({interface: factory.interface} as any, 'PoolsFacade__ZeroAddress');
    });

    it('PoolsFacade rejects a zero USDT', async function () {
      const {owner, a7a5, wa7a5, pair, router, quoter} = await loadFixture(deploySecurityFixture);
      const factory = await ethers.getContractFactory('PoolsFacade');
      await expect(
        (factory as any).deploy(
          await wa7a5.getAddress(),
          await a7a5.getAddress(),
          ethers.ZeroAddress,
          await pair.getAddress(),
          await router.getAddress(),
          await quoter.getAddress(),
          FEE,
          await owner.getAddress(),
        ),
      ).to.be.revertedWithCustomError({interface: factory.interface} as any, 'PoolsFacade__ZeroAddress');
    });

    it('PoolsFacade rejects a zero V2 pair', async function () {
      const {owner, a7a5, usdt, wa7a5, router, quoter} = await loadFixture(deploySecurityFixture);
      const factory = await ethers.getContractFactory('PoolsFacade');
      await expect(
        (factory as any).deploy(
          await wa7a5.getAddress(),
          await a7a5.getAddress(),
          await usdt.getAddress(),
          ethers.ZeroAddress,
          await router.getAddress(),
          await quoter.getAddress(),
          FEE,
          await owner.getAddress(),
        ),
      ).to.be.revertedWithCustomError({interface: factory.interface} as any, 'PoolsFacade__ZeroAddress');
    });

    it('PoolsFacade rejects a zero V3 router', async function () {
      const {owner, a7a5, usdt, wa7a5, pair, quoter} = await loadFixture(deploySecurityFixture);
      const factory = await ethers.getContractFactory('PoolsFacade');
      await expect(
        (factory as any).deploy(
          await wa7a5.getAddress(),
          await a7a5.getAddress(),
          await usdt.getAddress(),
          await pair.getAddress(),
          ethers.ZeroAddress,
          await quoter.getAddress(),
          FEE,
          await owner.getAddress(),
        ),
      ).to.be.revertedWithCustomError({interface: factory.interface} as any, 'PoolsFacade__ZeroAddress');
    });

    it('PoolsFacade rejects a zero V3 quoter', async function () {
      const {owner, a7a5, usdt, wa7a5, pair, router} = await loadFixture(deploySecurityFixture);
      const factory = await ethers.getContractFactory('PoolsFacade');
      await expect(
        (factory as any).deploy(
          await wa7a5.getAddress(),
          await a7a5.getAddress(),
          await usdt.getAddress(),
          await pair.getAddress(),
          await router.getAddress(),
          ethers.ZeroAddress,
          FEE,
          await owner.getAddress(),
        ),
      ).to.be.revertedWithCustomError({interface: factory.interface} as any, 'PoolsFacade__ZeroAddress');
    });

    it('ParaSwap rejects a zero facade', async function () {
      const {owner, router} = await loadFixture(deploySecurityFixture);
      const factory = await ethers.getContractFactory('ParaSwap');
      await expect(factory.deploy(ethers.ZeroAddress, await router.getAddress(), await owner.getAddress())).to.be.revertedWithCustomError(
        {interface: factory.interface} as any,
        'ParaSwap__ZeroAddress',
      );
    });

    it('ParaSwap rejects a zero V3 router', async function () {
      const {owner, pair} = await loadFixture(deploySecurityFixture);
      const factory = await ethers.getContractFactory('ParaSwap');
      await expect(factory.deploy(await pair.getAddress(), ethers.ZeroAddress, await owner.getAddress())).to.be.revertedWithCustomError(
        {interface: factory.interface} as any,
        'ParaSwap__ZeroAddress',
      );
    });

    it('ParaSwap rejects a facade with a zero quoter', async function () {
      const {owner, a7a5, usdt, wa7a5, router} = await loadFixture(deploySecurityFixture);
      const factory = await ethers.getContractFactory('ParaSwap');
      const badFacade = await ethers.deployContract('MockFacadeConfig', [
        await a7a5.getAddress(),
        await wa7a5.getAddress(),
        await usdt.getAddress(),
        ethers.ZeroAddress,
      ]);
      await expect(factory.deploy(await badFacade.getAddress(), await router.getAddress(), await owner.getAddress())).to.be.revertedWithCustomError(
        {interface: factory.interface} as any,
        'ParaSwap__ZeroAddress',
      );
    });
  });

  describe('pause / unpause', function () {
    it('only the owner can pause PoolsFacade', async function () {
      const {attacker, facade} = await loadFixture(deploySecurityFixture);
      await expect(facade.connect(attacker).pause()).to.be.revertedWithCustomError(facade, 'OwnableUnauthorizedAccount');
    });

    it('only the owner can pause ParaSwap', async function () {
      const {attacker, paraSwap} = await loadFixture(deploySecurityFixture);
      await expect(paraSwap.connect(attacker).pause()).to.be.revertedWithCustomError(paraSwap, 'OwnableUnauthorizedAccount');
    });

    it('PoolsFacade blocks swaps while paused', async function () {
      const {owner, trader, usdt, a7a5, facade} = await loadFixture(deploySecurityFixture);
      await facade.connect(owner).pause();
      await approve(usdt, trader, facade, UNIT);
      await expect(
        facade.connect(trader)['swap(address,address,uint256,uint256,uint256)'](await usdt.getAddress(), await a7a5.getAddress(), UNIT, 0n, DEADLINE),
      ).to.be.revertedWithCustomError(facade, 'EnforcedPause');
    });

    it('ParaSwap blocks swaps while paused', async function () {
      const {owner, trader, usdt, a7a5, paraSwap} = await loadFixture(deploySecurityFixture);
      await paraSwap.connect(owner).pause();
      await approve(usdt, trader, paraSwap, UNIT);
      await expect(
        paraSwap
          .connect(trader)
          ['swap(address,address,uint256,uint256,uint24,uint256)'](await usdt.getAddress(), await a7a5.getAddress(), UNIT, 0n, FEE, DEADLINE),
      ).to.be.revertedWithCustomError(paraSwap, 'EnforcedPause');
    });
  });

  // ── PoolsFacade ─────────────────────────────────────────────────────────────

  describe('PoolsFacade dispatch and recipients', function () {
    it('dispatches USDT → A7A5 to a custom recipient', async function () {
      const {trader, recipient, a7a5, usdt, facade} = await loadFixture(deploySecurityFixture);
      const recipientAddress = await recipient.getAddress();
      await approve(usdt, trader, facade, UNIT);

      const before = await (a7a5 as any).balanceOf(recipientAddress);
      await facade
        .connect(trader)
        [
          'swap(address,address,uint256,uint256,uint256,address)'
        ](await usdt.getAddress(), await a7a5.getAddress(), UNIT, UNIT, DEADLINE, recipientAddress);
      expect((await (a7a5 as any).balanceOf(recipientAddress)) - before).to.equal(UNIT);
    });

    it('dispatches USDT → wA7A5 to a custom recipient', async function () {
      const {trader, recipient, usdt, wa7a5, facade} = await loadFixture(deploySecurityFixture);
      const recipientAddress = await recipient.getAddress();
      await approve(usdt, trader, facade, UNIT);

      const before = await (wa7a5 as any).balanceOf(recipientAddress);
      await facade
        .connect(trader)
        [
          'swap(address,address,uint256,uint256,uint256,address)'
        ](await usdt.getAddress(), await wa7a5.getAddress(), UNIT, UNIT, DEADLINE, recipientAddress);
      expect((await (wa7a5 as any).balanceOf(recipientAddress)) - before).to.equal(UNIT);
    });

    it('reverts when the final-output minimum is not met', async function () {
      const {trader, recipient, usdt, wa7a5, facade} = await loadFixture(deploySecurityFixture);
      await approve(usdt, trader, facade, UNIT);
      await expect(
        facade
          .connect(trader)
          [
            'swap(address,address,uint256,uint256,uint256,address)'
          ](await usdt.getAddress(), await wa7a5.getAddress(), UNIT, UNIT + 1n, DEADLINE, await recipient.getAddress()),
      ).to.be.revert(ethers);
    });

    it('rejects a zero recipient on the dispatcher', async function () {
      const {trader, a7a5, usdt, facade} = await loadFixture(deploySecurityFixture);
      await approve(usdt, trader, facade, UNIT);
      await expect(
        facade
          .connect(trader)
          [
            'swap(address,address,uint256,uint256,uint256,address)'
          ](await usdt.getAddress(), await a7a5.getAddress(), UNIT, 0n, DEADLINE, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(facade, 'PoolsFacade__ZeroRecipient');
    });

    it('rejects an unsupported tokenIn', async function () {
      const {trader, usdt, other, facade} = await loadFixture(deploySecurityFixture);
      await approve(usdt, trader, facade, UNIT);
      await expect(
        facade
          .connect(trader)
          ['swap(address,address,uint256,uint256,uint256)'](await other.getAddress(), await usdt.getAddress(), UNIT, 0n, DEADLINE),
      ).to.be.revertedWithCustomError(facade, 'PoolsFacade__InvalidToken');
    });

    it('rejects same-token dispatch', async function () {
      const {trader, usdt, facade} = await loadFixture(deploySecurityFixture);
      await approve(usdt, trader, facade, UNIT);
      await expect(
        facade.connect(trader)['swap(address,address,uint256,uint256,uint256)'](await usdt.getAddress(), await usdt.getAddress(), UNIT, 0n, DEADLINE),
      ).to.be.revertedWithCustomError(facade, 'PoolsFacade__InvalidToken');
    });

    it('swapA7A5 rejects a zero recipient', async function () {
      const {trader, usdt, facade} = await loadFixture(deploySecurityFixture);
      await approve(usdt, trader, facade, UNIT);
      await expect(
        (facade.connect(trader) as any)['swapA7A5(uint256,uint8,uint256,uint256,address)'](UNIT, BUY, 0n, DEADLINE, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(facade, 'PoolsFacade__ZeroRecipient');
    });

    it('swapWA7A5 rejects a zero recipient', async function () {
      const {trader, wa7a5, facade} = await loadFixture(deploySecurityFixture);
      await approve(wa7a5, trader, facade, UNIT);
      await expect(
        (facade.connect(trader) as any)['swapWA7A5(uint256,uint8,uint256,uint256,address)'](UNIT, SELL, 0n, DEADLINE, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(facade, 'PoolsFacade__ZeroRecipient');
    });

    it('swapA7A5AtBestQuote rejects a zero recipient', async function () {
      const {trader, a7a5, facade} = await loadFixture(deploySecurityFixture);
      await approve(a7a5, trader, facade, UNIT);
      await expect(
        (facade.connect(trader) as any)['swapA7A5AtBestQuote(uint256,uint8,uint256,uint256,address)'](UNIT, SELL, 0n, DEADLINE, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(facade, 'PoolsFacade__ZeroRecipient');
    });

    it('swapA7A5 reverts on excessive amountOutMin', async function () {
      const {trader, a7a5, facade} = await loadFixture(deploySecurityFixture);
      await approve(a7a5, trader, facade, UNIT);
      await expect((facade.connect(trader) as any).swapA7A5(UNIT, SELL, ethers.MaxUint256, DEADLINE)).to.be.revertedWithCustomError(
        facade,
        'PoolsFacade__InsufficientOutput',
      );
    });

    it('swapA7A5AtBestQuote reverts on excessive amountOutMin', async function () {
      const {trader, a7a5, facade} = await loadFixture(deploySecurityFixture);
      await approve(a7a5, trader, facade, UNIT);
      await expect((facade.connect(trader) as any).swapA7A5AtBestQuote(UNIT, SELL, ethers.MaxUint256, DEADLINE)).to.be.revertedWithCustomError(
        facade,
        'PoolsFacade__InsufficientOutput',
      );
    });

    it('swapWA7A5 reverts on excessive amountOutMin', async function () {
      const {trader, wa7a5, facade} = await loadFixture(deploySecurityFixture);
      await approve(wa7a5, trader, facade, UNIT);
      await expect((facade.connect(trader) as any).swapWA7A5(UNIT, SELL, ethers.MaxUint256, DEADLINE)).to.be.revert(ethers);
    });
  });

  describe('PoolsFacade FOT accounting and approvals', function () {
    it('V2 BUY credits the recipient balance delta, not the gross pair output', async function () {
      const {trader, a7a5, usdt, pair, facade} = await loadFixture(deploySecurityFixture);
      await (a7a5 as any).setFee(100); // 1%
      await approve(usdt, trader, facade, UNIT);

      const traderAddress = await trader.getAddress();
      const before = await (a7a5 as any).balanceOf(traderAddress);
      const expected = await (facade.connect(trader) as any).swapA7A5.staticCall(UNIT, BUY, 0n, DEADLINE);
      await (facade.connect(trader) as any).swapA7A5(UNIT, BUY, expected, DEADLINE);
      const actual = (await (a7a5 as any).balanceOf(traderAddress)) - before;
      const grossPairOutput = await (pair as any).lastAmount0Out();

      expect(actual).to.equal(expected);
      expect(actual).to.be.lessThan(grossPairOutput);
      expect(await (a7a5 as any).balanceOf(await facade.getAddress())).to.equal(0n);
      expect(await (usdt as any).balanceOf(await facade.getAddress())).to.equal(0n);
    });

    it('clears the router USDT allowance after swapWA7A5 BUY', async function () {
      const {trader, usdt, router, facade} = await loadFixture(deploySecurityFixture);
      await approve(usdt, trader, facade, UNIT);
      await (facade.connect(trader) as any).swapWA7A5(UNIT, BUY, UNIT, DEADLINE);
      expect(await (usdt as any).allowance(await facade.getAddress(), await router.getAddress())).to.equal(0n);
    });

    it('clears wrapper and router allowances after swapA7A5AtBestQuote SELL', async function () {
      const {trader, a7a5, wa7a5, router, facade} = await loadFixture(deploySecurityFixture);
      await approve(a7a5, trader, facade, UNIT);
      await (facade.connect(trader) as any).swapA7A5AtBestQuote(UNIT, SELL, 0n, DEADLINE);
      expect(await (a7a5 as any).allowance(await facade.getAddress(), await wa7a5.getAddress())).to.equal(0n);
      expect(await (wa7a5 as any).allowance(await facade.getAddress(), await router.getAddress())).to.equal(0n);
    });
  });

  // ── ParaSwap ────────────────────────────────────────────────────────────────

  describe('ParaSwap routes', function () {
    async function swapToRecipient(paraSwap: any, trader: any, tokenIn: any, tokenOut: any, recipientAddress: string) {
      await approve(tokenIn, trader, paraSwap, UNIT);
      const before = await tokenOut.balanceOf(recipientAddress);
      await paraSwap
        .connect(trader)
        [
          'swap(address,address,uint256,uint256,uint24,uint256,address)'
        ](await tokenIn.getAddress(), await tokenOut.getAddress(), UNIT, 1n, FEE, DEADLINE, recipientAddress);
      return (await tokenOut.balanceOf(recipientAddress)) - before;
    }

    it('route 00 (other → USDT) pays a custom recipient and retains no balances', async function () {
      const {trader, recipient, usdt, other, paraSwap} = await loadFixture(deploySecurityFixture);
      const recipientAddress = await recipient.getAddress();
      const paraAddress = await paraSwap.getAddress();
      const gained = await swapToRecipient(paraSwap, trader, other, usdt, recipientAddress);
      expect(gained).to.be.greaterThan(0n);
      expect(await other.balanceOf(paraAddress)).to.equal(0n);
      expect(await usdt.balanceOf(paraAddress)).to.equal(0n);
    });

    it('route 01 (other → wA7A5) pays a custom recipient and retains no balances', async function () {
      const {trader, recipient, usdt, other, wa7a5, paraSwap} = await loadFixture(deploySecurityFixture);
      const recipientAddress = await recipient.getAddress();
      const paraAddress = await paraSwap.getAddress();
      const gained = await swapToRecipient(paraSwap, trader, other, wa7a5, recipientAddress);
      expect(gained).to.be.greaterThan(0n);
      expect(await other.balanceOf(paraAddress)).to.equal(0n);
      expect(await usdt.balanceOf(paraAddress)).to.equal(0n);
    });

    it('route 10 (wA7A5 → other) pays a custom recipient and retains no balances', async function () {
      const {trader, recipient, usdt, other, wa7a5, paraSwap} = await loadFixture(deploySecurityFixture);
      const recipientAddress = await recipient.getAddress();
      const paraAddress = await paraSwap.getAddress();
      const gained = await swapToRecipient(paraSwap, trader, wa7a5, other, recipientAddress);
      expect(gained).to.be.greaterThan(0n);
      expect(await wa7a5.balanceOf(paraAddress)).to.equal(0n);
      expect(await usdt.balanceOf(paraAddress)).to.equal(0n);
    });

    it('route 11 (A7A5 → wA7A5) pays a custom recipient and retains no balances', async function () {
      const {trader, recipient, a7a5, usdt, wa7a5, paraSwap} = await loadFixture(deploySecurityFixture);
      const recipientAddress = await recipient.getAddress();
      const paraAddress = await paraSwap.getAddress();
      const gained = await swapToRecipient(paraSwap, trader, a7a5, wa7a5, recipientAddress);
      expect(gained).to.be.greaterThan(0n);
      expect(await a7a5.balanceOf(paraAddress)).to.equal(0n);
      expect(await usdt.balanceOf(paraAddress)).to.equal(0n);
    });
  });

  describe('ParaSwap route-11 FOT invariants', function () {
    it('wrap quotes increase monotonically across sample sizes', async function () {
      const {a7a5, wa7a5, paraSwap} = await loadFixture(deploySecurityFixture);
      await (a7a5 as any).setFee(100);
      let previousQuote = 0n;
      for (const amount of [1_000n, 100_000n, UNIT, 10n * UNIT]) {
        const quote = await paraSwap.quote.staticCall(await a7a5.getAddress(), await wa7a5.getAddress(), amount, FEE);
        expect(quote).to.be.greaterThan(previousQuote);
        previousQuote = quote;
      }
    });

    it('wrap execution matches quote with amountOutMin = quote', async function () {
      const {trader, a7a5, wa7a5, paraSwap} = await loadFixture(deploySecurityFixture);
      await (a7a5 as any).setFee(100);
      const traderAddress = await trader.getAddress();

      for (const amount of [1_000n, 100_000n, UNIT, 10n * UNIT]) {
        const quote = await paraSwap.quote.staticCall(await a7a5.getAddress(), await wa7a5.getAddress(), amount, FEE);
        await approve(a7a5, trader, paraSwap, amount);
        const before = await (wa7a5 as any).balanceOf(traderAddress);
        await paraSwap
          .connect(trader)
          ['swap(address,address,uint256,uint256,uint24,uint256)'](await a7a5.getAddress(), await wa7a5.getAddress(), amount, quote, FEE, DEADLINE);
        const actual = (await (wa7a5 as any).balanceOf(traderAddress)) - before;
        expect(checkRoundingError(actual, quote)).to.equal(true);
        expect(actual).to.be.closeTo(quote, A7A5_MAX_ROUNDING_ERROR);
      }
    });

    it('unwrap execution matches quote with amountOutMin = quote', async function () {
      const {trader, a7a5, wa7a5, paraSwap} = await loadFixture(deploySecurityFixture);
      await (a7a5 as any).setFee(100);
      const traderAddress = await trader.getAddress();
      const unwrapAmount = UNIT;

      const unwrapQuote = await paraSwap.quote.staticCall(await wa7a5.getAddress(), await a7a5.getAddress(), unwrapAmount, FEE);
      await approve(wa7a5, trader, paraSwap, unwrapAmount);
      const before = await (a7a5 as any).balanceOf(traderAddress);
      await paraSwap
        .connect(trader)
        [
          'swap(address,address,uint256,uint256,uint24,uint256)'
        ](await wa7a5.getAddress(), await a7a5.getAddress(), unwrapAmount, unwrapQuote, FEE, DEADLINE);
      const actual = (await (a7a5 as any).balanceOf(traderAddress)) - before;
      expect(checkRoundingError(actual, unwrapQuote)).to.equal(true);
      expect(actual).to.be.closeTo(unwrapQuote, A7A5_MAX_ROUNDING_ERROR);
    });
  });

  describe('ParaSwap guards and approvals', function () {
    it('quote and swap reject a wrong V3 fee tier', async function () {
      const {trader, other, usdt, paraSwap} = await loadFixture(deploySecurityFixture);
      await expect(paraSwap.quote.staticCall(await other.getAddress(), await usdt.getAddress(), UNIT, 500)).to.be.revertedWith('wrong fee');
      await approve(other, trader, paraSwap, UNIT);
      await expect(
        paraSwap
          .connect(trader)
          ['swap(address,address,uint256,uint256,uint24,uint256)'](await other.getAddress(), await usdt.getAddress(), UNIT, 0n, 500, DEADLINE),
      ).to.be.revertedWith('wrong fee');
    });

    it('rejects a zero recipient', async function () {
      const {trader, a7a5, usdt, paraSwap} = await loadFixture(deploySecurityFixture);
      await approve(usdt, trader, paraSwap, UNIT);
      await expect(
        paraSwap
          .connect(trader)
          [
            'swap(address,address,uint256,uint256,uint24,uint256,address)'
          ](await usdt.getAddress(), await a7a5.getAddress(), UNIT, 0n, FEE, DEADLINE, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(paraSwap, 'ParaSwap__ZeroRecipient');
    });

    it('rejects an expired deadline', async function () {
      const {trader, a7a5, usdt, paraSwap} = await loadFixture(deploySecurityFixture);
      await approve(usdt, trader, paraSwap, UNIT);
      await expect(
        paraSwap
          .connect(trader)
          ['swap(address,address,uint256,uint256,uint24,uint256)'](await usdt.getAddress(), await a7a5.getAddress(), UNIT, 0n, FEE, 0n),
      ).to.be.revertedWithCustomError(paraSwap, 'ParaSwap__Expired');
    });

    it('rejects a missing allowance', async function () {
      const {recipient, usdt, other, paraSwap} = await loadFixture(deploySecurityFixture);
      await expect(
        paraSwap
          .connect(recipient)
          ['swap(address,address,uint256,uint256,uint24,uint256)'](await other.getAddress(), await usdt.getAddress(), UNIT, 0n, FEE, DEADLINE),
      ).to.be.revertedWithCustomError(paraSwap, 'ParaSwap__InsufficientAllowance');
    });

    it('rejects when final slippage is not met', async function () {
      const {trader, a7a5, usdt, paraSwap} = await loadFixture(deploySecurityFixture);
      await approve(usdt, trader, paraSwap, UNIT);
      await expect(
        paraSwap
          .connect(trader)
          ['swap(address,address,uint256,uint256,uint24,uint256)'](await usdt.getAddress(), await a7a5.getAddress(), UNIT, 2n * UNIT, FEE, DEADLINE),
      ).to.be.revert(ethers);
    });

    it('clears the V3 router allowance after a direct route', async function () {
      const {trader, usdt, other, router, paraSwap} = await loadFixture(deploySecurityFixture);
      const paraAddress = await paraSwap.getAddress();
      await approve(other, trader, paraSwap, UNIT);
      await paraSwap
        .connect(trader)
        ['swap(address,address,uint256,uint256,uint24,uint256)'](await other.getAddress(), await usdt.getAddress(), UNIT, 0n, FEE, DEADLINE);
      expect(await other.allowance(paraAddress, await router.getAddress())).to.equal(0n);
    });

    it('clears the facade USDT allowance after a two-hop buy', async function () {
      const {trader, usdt, other, wa7a5, facade, paraSwap} = await loadFixture(deploySecurityFixture);
      const paraAddress = await paraSwap.getAddress();
      await approve(other, trader, paraSwap, UNIT);
      await paraSwap
        .connect(trader)
        ['swap(address,address,uint256,uint256,uint24,uint256)'](await other.getAddress(), await wa7a5.getAddress(), UNIT, 0n, FEE, DEADLINE);
      expect(await usdt.allowance(paraAddress, await facade.getAddress())).to.equal(0n);
    });

    it('clears the facade A7A5 allowance after a delegated sell', async function () {
      const {trader, a7a5, usdt, facade, paraSwap} = await loadFixture(deploySecurityFixture);
      const paraAddress = await paraSwap.getAddress();
      await approve(a7a5, trader, paraSwap, UNIT);
      await paraSwap
        .connect(trader)
        ['swap(address,address,uint256,uint256,uint24,uint256)'](await a7a5.getAddress(), await usdt.getAddress(), UNIT, 0n, FEE, DEADLINE);
      expect(await a7a5.allowance(paraAddress, await facade.getAddress())).to.equal(0n);
    });
  });

  // ── Reentrancy ──────────────────────────────────────────────────────────────

  describe('reentrancy defenses', function () {
    it('blocks a malicious input-token callback during a direct V2 swap', async function () {
      const {trader, a7a5, usdt, facade} = await loadFixture(deploySecurityFixture);
      const attack = facade.interface.encodeFunctionData('swapA7A5(uint256,uint8,uint256,uint256)', [UNIT, BUY, 0n, DEADLINE]);
      await (usdt as any).setCallback(await facade.getAddress(), attack, true);
      await approve(usdt, trader, facade, UNIT);
      await (facade.connect(trader) as any).swapA7A5(UNIT, BUY, 0n, DEADLINE);
      expect(await (usdt as any).callbackAttempted()).to.equal(true);
      expect(await (usdt as any).callbackSucceeded()).to.equal(false);
      expect(await (a7a5 as any).balanceOf(await trader.getAddress())).to.be.greaterThan(0n);
    });

    it('blocks a malicious V3 callback during a mixed facade swap', async function () {
      const {trader, usdt, router, facade} = await loadFixture(deploySecurityFixture);
      const attack = facade.interface.encodeFunctionData('swapA7A5AtBestQuote(uint256,uint8,uint256,uint256)', [UNIT, BUY, 0n, DEADLINE]);
      await (router as any).setCallback(await facade.getAddress(), attack);
      await approve(usdt, trader, facade, UNIT);
      await (facade.connect(trader) as any).swapA7A5AtBestQuote(UNIT, BUY, 0n, DEADLINE);
      expect(await (router as any).callbackAttempted()).to.equal(true);
      expect(await (router as any).callbackSucceeded()).to.equal(false);
    });

    it('blocks reentry into ParaSwap from a delegated facade/router path', async function () {
      const {trader, usdt, wa7a5, router, paraSwap} = await loadFixture(deploySecurityFixture);
      const attack = paraSwap.interface.encodeFunctionData('swap(address,address,uint256,uint256,uint24,uint256)', [
        await usdt.getAddress(),
        await wa7a5.getAddress(),
        UNIT,
        0n,
        FEE,
        DEADLINE,
      ]);
      await (router as any).setCallback(await paraSwap.getAddress(), attack);
      await approve(usdt, trader, paraSwap, UNIT);
      await paraSwap
        .connect(trader)
        ['swap(address,address,uint256,uint256,uint24,uint256)'](await usdt.getAddress(), await wa7a5.getAddress(), UNIT, 0n, FEE, DEADLINE);
      expect(await (router as any).callbackAttempted()).to.equal(true);
      expect(await (router as any).callbackSucceeded()).to.equal(false);
    });
  });
});
