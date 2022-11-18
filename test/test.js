const { ethers } = require("hardhat");

describe("DeployTest", function() {
    it("", async function () {
        const nftContractFactory = await ethers.getContractFactory("GyomouNFT");
        const nftContract = await nftContractFactory.deploy(
          "0xa8EF929dB5653d0f882689549DA9267CcbeB1359",
          "500"
        );

        await nftContract.deployed();
        console.log("Contract deployed to:", nftContract.address);

        
        let txn = await nftContract.mint("0");
        await txn.wait();
    
        console.log("Done");    
    })
})
