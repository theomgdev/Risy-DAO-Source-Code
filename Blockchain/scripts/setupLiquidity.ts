import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { ethers } from "hardhat";
import { RisyDAO, IERC20Metadata, IUniswapV2Router02 } from "../typechain-types";

async function main() {
  // Get environment variables
  const risyDAOAddress = process.env.RISY_DAO_ADDRESS;
  const usdtAddress = process.env.USDT_ADDRESS;
  const paxgAddress = process.env.PAXG_ADDRESS;
  const routerAddress = process.env.UNISWAP_ROUTER_ADDRESS;

  if (!risyDAOAddress || !usdtAddress || !paxgAddress || !routerAddress) {
    console.error("Please provide all required addresses in the .env file.");
    process.exit(1);
  }

  console.log("Setting up liquidity pools...");

  // Get the signer (owner)
  const [owner] = await ethers.getSigners();
  console.log("Executing with account:", owner.address);

  // Get contract instances
  const risyDAO = await ethers.getContractAt("RisyDAO", risyDAOAddress) as RisyDAO;
  const usdt = await ethers.getContractAt("IERC20", usdtAddress) as IERC20Metadata;
  const paxg = await ethers.getContractAt("IERC20", paxgAddress) as IERC20Metadata;
  const router = await ethers.getContractAt("IUniswapV2Router02", routerAddress) as IUniswapV2Router02;

  // Whitelist router address
  console.log("Whitelisting router address...");
  await risyDAO.setWhiteList(routerAddress, true);

  // Get token balances
  const risyBalance = await risyDAO.balanceOf(owner.address);
  const usdtBalance = await usdt.balanceOf(owner.address);
  const paxgBalance = await paxg.balanceOf(owner.address);

  console.log("Available balances:");
  console.log(`RISY: ${ethers.formatEther(risyBalance)}`);
  console.log(`USDT: ${ethers.formatUnits(usdtBalance, await usdt.decimals())}`);
  console.log(`PAXG: ${ethers.formatUnits(paxgBalance, await paxg.decimals())}`);

  // Calculate liquidity amounts
  const risyLiquidityPerPair = risyBalance / 2n;
  const usdtLiquidity = usdtBalance;
  const paxgLiquidity = paxgBalance;

  // Approve router to spend tokens
  console.log("Approving router to spend tokens...");
  await risyDAO.approve(routerAddress, risyBalance);
  await usdt.approve(routerAddress, usdtLiquidity);
  await paxg.approve(routerAddress, paxgLiquidity);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

  // Add liquidity for RISY-USDT pair
  console.log("Adding liquidity for RISY-USDT pair...");
  await router.addLiquidity(
    risyDAOAddress,
    usdtAddress,
    risyLiquidityPerPair,
    usdtLiquidity,
    0n,
    0n,
    owner.address,
    deadline
  );

  // Add liquidity for RISY-PAXG pair
  console.log("Adding liquidity for RISY-PAXG pair...");
  await router.addLiquidity(
    risyDAOAddress,
    paxgAddress,
    risyLiquidityPerPair,
    paxgLiquidity,
    0n,
    0n,
    owner.address,
    deadline
  );

  console.log("Liquidity setup completed!");

  // Log final balances
  const finalRisyBalance = await risyDAO.balanceOf(owner.address);
  const finalUsdtBalance = await usdt.balanceOf(owner.address);
  const finalPaxgBalance = await paxg.balanceOf(owner.address);

  console.log("Final balances:");
  console.log(`RISY: ${ethers.formatEther(finalRisyBalance)}`);
  console.log(`USDT: ${ethers.formatUnits(finalUsdtBalance, await usdt.decimals())}`);
  console.log(`PAXG: ${ethers.formatUnits(finalPaxgBalance, await paxg.decimals())}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });