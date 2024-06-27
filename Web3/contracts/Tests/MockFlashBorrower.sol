// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";
import "@openzeppelin/contracts/interfaces/IERC3156FlashLender.sol"; // Add this import statement
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockFlashBorrower is IERC3156FlashBorrower {
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");
    bytes32 public constant CALLBACK_FAILURE = keccak256("0");

    bool public shouldRepay;
    address public flashLender;

    constructor(address _flashLender) {
        flashLender = _flashLender;
        shouldRepay = true;
    }

    function setShouldRepay(bool _shouldRepay) external {
        shouldRepay = _shouldRepay;
    }

    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        // solhint-disable-next-line no-unused-vars
        bytes calldata data
    ) external override returns (bytes32) {
        require(msg.sender == flashLender, "FlashBorrower: Untrusted lender");
        require(initiator == address(this), "FlashBorrower: Untrusted loan initiator");

        if (shouldRepay) {
            IERC20(token).approve(flashLender, amount + fee);
            return CALLBACK_SUCCESS;
        } else {
            return CALLBACK_FAILURE;
        }
    }

    function flashBorrow(address token, uint256 amount) external {
        IERC3156FlashLender(flashLender).flashLoan(this, token, amount, "");
    }
}