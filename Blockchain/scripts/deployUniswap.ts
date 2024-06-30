import { ethers } from "hardhat";
import { UniswapV2Router02 } from "../typechain-types";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy UniswapV2Router02
  const UniswapV2Router02Factory = await ethers.getContractFactory("UniswapV2Router02");
  const UniswapV2Router02 = await UniswapV2Router02Factory.deploy("0x586A31a288E178369FFF020bA63d2224cf8661E9","0x360ad4f9a9a8efe9a8dcb5f461c4cc1047e1dcf9") as UniswapV2Router02;
  await UniswapV2Router02.waitForDeployment();

  console.log("UniswapV2Router02 deployed to:", await UniswapV2Router02.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });