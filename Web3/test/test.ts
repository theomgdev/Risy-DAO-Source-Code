import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { RisyDAO__factory, RisyDAO, MockFlashBorrower, MockFlashBorrower__factory } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Risy DAO ERC20", function () {
  let ContractFactory: RisyDAO__factory;
  let instance: RisyDAO;
  let signers: HardhatEthersSigner[];
  let owner: HardhatEthersSigner;
  let decimals: bigint;

  describe("ERC20: Standard tests", function () {
    beforeEach(async function () {
      signers = await ethers.getSigners();
      ContractFactory = await ethers.getContractFactory("RisyDAO") as RisyDAO__factory;
      owner = signers[0];
      instance = await upgrades.deployProxy(ContractFactory, [owner.address, 0]) as unknown as RisyDAO;
      await instance.waitForDeployment();
      decimals = await instance.decimals();
    });
  
    it("Test initial creation of contract", async function () {
      expect(await instance.name()).to.equal("Risy DAO");
      expect(decimals).to.equal(18);
      expect(await instance.totalSupply()).to.equal(BigInt(1_000_000_000_000) * BigInt(10) ** BigInt(decimals));
      expect(await instance.balanceOf(owner.address)).to.equal(BigInt(1_000_000_000_000) * BigInt(10) ** BigInt(decimals));
    });
  
    it("Test transfers, approvals, and allowances", async function () {
      let recipient = signers[1];
      let spender = signers[2];
      let ownerFirstBalance = await instance.balanceOf(owner.address);
  
      await instance.connect(owner).transfer(recipient.address, 1000);
      expect(await instance.balanceOf(recipient.address)).to.equal(1000);
  
      await expect(instance.connect(spender).transferFrom(owner.address, recipient.address, 1000))
        .to.be.revertedWithCustomError(instance, "ERC20InsufficientAllowance");
  
      await instance.connect(owner).approve(spender.address, 1000);
      await instance.connect(spender).transferFrom(owner.address, recipient.address, 1000);
      expect(await instance.balanceOf(recipient.address)).to.equal(2000);
  
      await expect(instance.connect(owner).transfer(recipient.address, ownerFirstBalance))
        .to.be.revertedWithCustomError(instance, "ERC20InsufficientBalance");
    });
  
    it("Test minting and burning", async function () {
      let recipient = signers[1];
      let ownerFirstBalance = await instance.balanceOf(owner.address);
  
      await instance.connect(owner).mint(recipient.address, 1000);
      expect(await instance.balanceOf(recipient.address)).to.equal(1000);
  
      await instance.connect(recipient).burn(500);
      expect(await instance.balanceOf(recipient.address)).to.equal(500);
  
      await expect(instance.connect(recipient).burn(ownerFirstBalance))
        .to.be.revertedWithCustomError(instance, "ERC20InsufficientBalance");
    });
  
    it("Test capped supply", async function () {
      let recipient = signers[1];
      let cap = await instance.cap();
      let totalSupply = await instance.totalSupply();
  
      await expect(instance.connect(owner).mint(recipient.address, BigInt(cap) - BigInt(totalSupply) + BigInt(1)))
        .to.be.revertedWithCustomError(instance, "ERC20ExceededCap");
  
      await instance.connect(owner).mint(recipient.address, BigInt(cap) - BigInt(totalSupply));
      expect(await instance.totalSupply()).to.equal(cap);
    });
  
    it("Test pausing and unpausing", async function () {
      let recipient = signers[1];
  
      await instance.connect(owner).pause();
      await expect(instance.connect(owner).transfer(recipient.address, 1000))
        .to.be.revertedWithCustomError(instance, "EnforcedPause");
  
      await instance.connect(owner).unpause();
      await instance.connect(owner).transfer(recipient.address, 1000);
      expect(await instance.balanceOf(recipient.address)).to.equal(1000);
    });
  
    it("Test permit", async function () {
      const spender = signers[1];
      
      const domain = {
        name: await instance.name(),
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await instance.getAddress()
      };
  
      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      };
  
      const value = 1000;
      const nonce = await instance.nonces(owner.address);
      const deadline = ethers.MaxUint256;
  
      const permit = {
        owner: owner.address,
        spender: spender.address,
        value,
        nonce,
        deadline
      };
  
      const signature = await owner.signTypedData(domain, types, permit);
      const { v, r, s } = ethers.Signature.from(signature);
  
      await instance.permit(permit.owner, permit.spender, permit.value, permit.deadline, v, r, s);
  
      expect(await instance.allowance(owner.address, spender.address)).to.equal(value);
  
      await instance.connect(spender).transferFrom(owner.address, spender.address, value);
  
      expect(await instance.allowance(owner.address, spender.address)).to.equal(0);

      await expect(instance.permit(permit.owner, permit.spender, permit.value, permit.deadline, v, r, s))
        .to.be.revertedWithCustomError(instance, "ERC2612InvalidSigner");

      // Check balances
      expect(await instance.balanceOf(owner.address)).to.equal(BigInt(1_000_000_000_000) * BigInt(10) ** BigInt(decimals) - BigInt(value));
      expect(await instance.balanceOf(spender.address)).to.equal(value);
    });
  });

  describe("ERC20: Owner DAO Permission Tests", function () {
    let recipient: HardhatEthersSigner;

    beforeEach(async function () {
      recipient = signers[1];
      instance = await upgrades.deployProxy(ContractFactory, [owner.address, 0]) as unknown as RisyDAO;
      await instance.waitForDeployment();
    });

    it("Minting only works for owner", async function () {
      await expect(instance.connect(recipient).mint(recipient.address, 1000))
        .to.be.revertedWithCustomError(instance, "OwnableUnauthorizedAccount");

      await instance.connect(owner).mint(recipient.address, 1000);
      expect(await instance.balanceOf(recipient.address)).to.equal(1000);
    });

    it("Pausing and unpausing only works for owner", async function () {
      await expect(instance.connect(recipient).pause())
        .to.be.revertedWithCustomError(instance, "OwnableUnauthorizedAccount");

      await instance.connect(owner).pause();
      
      await expect(instance.connect(recipient).unpause())
        .to.be.revertedWithCustomError(instance, "OwnableUnauthorizedAccount");

      await instance.connect(owner).unpause();
    });

    it("Only owner is able to upgrade the UUPS contract", async function () {
      const RisyDAOFactory = await ethers.getContractFactory("RisyDAO");

      // Deploy using Hardhat's upgradeProxy function
      upgrades.validateImplementation(RisyDAOFactory);
      upgrades.validateUpgrade(await instance.getAddress(), RisyDAOFactory);
      upgrades.prepareUpgrade(await instance.getAddress(), RisyDAOFactory);
      const upgradedInstance = await upgrades.upgradeProxy(instance, RisyDAOFactory) as unknown as RisyDAO;
      await upgradedInstance.waitForDeployment();

      expect(await instance.owner()).to.equal(owner.address);
      expect(await instance.getVersion()).to.equal(2);

      // Manually deploy a new implementation contract
      const newImplementation = await RisyDAOFactory.deploy() as unknown as RisyDAO;
      await newImplementation.waitForDeployment();
  
      await expect(instance.connect(recipient).upgradeToAndCall(await newImplementation.getAddress(), "0x"))
        .to.be.revertedWithCustomError(instance, "OwnableUnauthorizedAccount");
  
      await instance.connect(owner).upgradeToAndCall(await newImplementation.getAddress(), "0x");

      expect(await instance.owner()).to.equal(owner.address);
      expect(await instance.getVersion()).to.equal(3);
    });
  });

  describe("ERC20: Flash Loan Mint Tests", function () {
    let MockFlashBorrowerFactory: MockFlashBorrower__factory;
    let risyDAO: RisyDAO;
    let flashBorrower: MockFlashBorrower;
    let signers: HardhatEthersSigner[];
    let owner: HardhatEthersSigner;
    let user: HardhatEthersSigner;
  
    beforeEach(async function () {
      signers = await ethers.getSigners();
      [owner, user] = signers;
  
      risyDAO = await upgrades.deployProxy(ContractFactory, [owner.address, 0]) as unknown as RisyDAO;
      await risyDAO.waitForDeployment();
  
      MockFlashBorrowerFactory = await ethers.getContractFactory("MockFlashBorrower") as MockFlashBorrower__factory;
      flashBorrower = await MockFlashBorrowerFactory.deploy(await risyDAO.getAddress());
      await flashBorrower.waitForDeployment();
    });
  
    it("should allow flash loans", async function () {
      const loanAmount = ethers.parseEther("1000");
      const fee = await risyDAO.flashFee(await risyDAO.getAddress(), loanAmount);

      // Mint fee to spend to the borrower
      await risyDAO.mint(await flashBorrower.getAddress(), fee);

      // Check initial balances
      expect(await risyDAO.balanceOf(await flashBorrower.getAddress())).to.equal(fee);
  
      // Perform flash loan
      await expect(flashBorrower.flashBorrow(await risyDAO.getAddress(), loanAmount))
        .to.not.be.reverted;
  
      // Check final balances (should be the same as initial)
      expect(await risyDAO.balanceOf(await flashBorrower.getAddress())).to.equal(0);
    });
  
    it("should revert if flash loan is not repaid", async function () {
      const loanAmount = ethers.parseEther("1000");
      
      // Set the borrower to not repay
      await flashBorrower.setShouldRepay(false);
  
      // Attempt flash loan
      await expect(flashBorrower.flashBorrow(await risyDAO.getAddress(), loanAmount))
        .to.be.revertedWithCustomError(risyDAO, "ERC3156InvalidReceiver");
    });
  
    it("should handle flash fees correctly", async function () {
      // Get the start balance of the owner
      const ownerStartBalance = await risyDAO.balanceOf(owner.address);
      const loanAmount = ethers.parseEther("1000");
      const fee = await risyDAO.flashFee(await risyDAO.getAddress(), loanAmount);
      // Mint fee to spend to the borrower
      await risyDAO.mint(await flashBorrower.getAddress(), fee);
      
      // Perform flash loan
      await flashBorrower.flashBorrow(await risyDAO.getAddress(), loanAmount);
  
      // Check if fee was transferred to fee receiver
      expect(await risyDAO.balanceOf(owner)).to.equal(BigInt(ownerStartBalance) + BigInt(fee));
    });

    it("should not allow flash loans over the cap", async function () {
      const cap = await risyDAO.cap();
      const excessiveLoanAmount = cap + 1n;
  
      // Attempt flash loan with excessive amount
      await expect(flashBorrower.flashBorrow(await risyDAO.getAddress(), excessiveLoanAmount))
        .to.be.revertedWithCustomError(risyDAO, "ERC3156ExceededMaxLoan");
    });
  
    it("should respect max flash loan amount", async function () {
      const maxLoan = await risyDAO.maxFlashLoan(await risyDAO.getAddress());
      const excessiveLoanAmount = maxLoan + 1n;
  
      // Attempt flash loan with excessive amount
      await expect(flashBorrower.flashBorrow(await risyDAO.getAddress(), excessiveLoanAmount))
        .to.be.revertedWithCustomError(risyDAO, "ERC3156ExceededMaxLoan");
    });
  });

  describe("ERC20: RisyDAO Voting and Delegation Tests", function () {
    let voter1: HardhatEthersSigner, voter2: HardhatEthersSigner;
  
    beforeEach(async function () {
      voter1 = signers[1];
      voter2 = signers[2];
      const RisyDAOFactory = await ethers.getContractFactory("RisyDAO");
      instance = await upgrades.deployProxy(RisyDAOFactory, [owner.address, 0]) as unknown as RisyDAO;
      await instance.waitForDeployment();
  
      // Mint some tokens to voters for testing (100 and 50 tokens respectively)
      await instance.mint(voter1.address, 100);
      await instance.mint(voter2.address, 50);
    });
  
    it("Should allow self-delegation", async function () {
      await instance.connect(voter1).delegate(voter1.address);
      expect(await instance.getVotes(voter1.address)).to.equal(100);
    });
  
    it("Should allow delegation to another address", async function () {
      await instance.connect(voter1).delegate(voter2.address);
      expect(await instance.getVotes(voter2.address)).to.equal(100);
      expect(await instance.getVotes(voter1.address)).to.equal(0);
    });
  
    it("Should update voting power when tokens are transferred", async function () {
      await instance.connect(voter1).delegate(voter1.address);
      await instance.connect(voter2).delegate(voter2.address);
  
      expect(await instance.getVotes(voter1.address)).to.equal(100);
      expect(await instance.getVotes(voter2.address)).to.equal(50);
  
      await instance.connect(voter1).transfer(voter2.address, 5);
  
      expect(await instance.getVotes(voter1.address)).to.equal(95);
      expect(await instance.getVotes(voter2.address)).to.equal(55);
    });
  
    it("Should allow checking voting power at a past timestamp", async function () {
      await instance.connect(voter1).delegate(voter1.address);

      const blockBefore = await ethers.provider.getBlock("latest");
      const timestampBefore = blockBefore!.timestamp;
  
      // Increase time by 1 hour (3600 seconds)
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []); // Mine a new block
  
      await instance.connect(voter1).transfer(voter2.address, 5);
  
      const blockAfter = await ethers.provider.getBlock("latest");
      const timestampAfter = blockAfter!.timestamp;
  
      // Wait for a short time to ensure the blockchain has processed the transfer
      await ethers.provider.send("evm_mine", []); // Mine another block
  
      // Use the timestamp from before the transfer for the first check
      expect(await instance.getPastVotes(voter1.address, timestampBefore)).to.equal(100);
      
      // Use the timestamp right after the transfer for the second check
      expect(await instance.getPastVotes(voter1.address, timestampAfter)).to.equal(95);
    });
  
    it("Should return the correct number of checkpoints", async function () {
      await instance.connect(voter1).delegate(voter1.address);
      await instance.connect(voter1).transfer(voter2.address, 3);
      await instance.connect(voter1).transfer(voter2.address, 2);
  
      expect(await instance.numCheckpoints(voter1.address)).to.equal(3);
    });
  });
});
