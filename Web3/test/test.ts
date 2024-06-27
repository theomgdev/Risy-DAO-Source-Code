import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { RisyDAO__factory, RisyDAO } from "../typechain-types";

describe("RisyDAO", async function () {
  const signers = await ethers.getSigners();

  const ContractFactory = await ethers.getContractFactory("RisyDAO") as RisyDAO__factory;

  const initialOwner = signers[0].address;

  const instance = await upgrades.deployProxy(ContractFactory, [initialOwner,0]) as unknown as RisyDAO;
  await instance.waitForDeployment();

  it("Test initial creation of contract", async function () {
    expect(await instance.name()).to.equal("Risy DAO");

    let decimals = await instance.decimals();
    expect(decimals).to.equal(18);

    expect(await instance.totalSupply()).to.equal(BigInt(1_000_000_000_000) * BigInt(10) ** BigInt(decimals));

    expect(await instance.balanceOf(initialOwner)).to.equal(BigInt(1_000_000_000_000) * BigInt(10) ** BigInt(decimals));
  });
});
