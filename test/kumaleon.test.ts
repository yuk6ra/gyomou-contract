import { expect } from "chai";
import { ethers } from "hardhat";
import {
  Kumaleon__factory,
  ERC721Sample__factory,
  KumaleonGenArt__factory,
  OldERC721Sample__factory,
} from "../typechain";
import { randomBytes } from "crypto";


const increaseBlockNumber = async (n: number) => {
  for (let index = 0; index < n; index++) {
    await ethers.provider.send("evm_mine", []);
  }
};

describe("Kumaleon", function () {
  let contractAddress: string;
  let erc721sampleAddress: string;
  let erc721sample2Address: string;
  let kumaleonGenArtAddress: string;
  const byte0 = ethers.utils.hexZeroPad(ethers.utils.hexValue(0), 32);
  const byte1 = ethers.utils.hexZeroPad(ethers.utils.hexValue(1), 32);

  before(async () => {
    await increaseBlockNumber(100);
  });

  beforeEach(async () => {
    const [deployer, tester1] = await ethers.getSigners();
    const factory = new Kumaleon__factory(deployer);
    const contract = await factory.deploy(deployer.address);
    contractAddress = contract.address;
    const ERC721Sample = new ERC721Sample__factory(deployer);
    const erc721sample = await ERC721Sample.deploy();
    const erc721sample2 = await ERC721Sample.deploy();
    erc721sampleAddress = erc721sample.address;
    erc721sample2Address = erc721sample2.address;
    const KumaleonGenArt = new KumaleonGenArt__factory(deployer);
    const kumaleonGenArt = await KumaleonGenArt.deploy("test", "test");
    kumaleonGenArtAddress = kumaleonGenArt.address;
    await kumaleonGenArt.setKumaleon(contractAddress);
    await kumaleonGenArt.addProject("test", tester1.address, 0);
    await kumaleonGenArt.toggleProjectIsActive(0);
    await kumaleonGenArt.toggleProjectIsPaused(0);
  });

  it("can mint", async function () {
    const [deployer] = await ethers.getSigners();
    const kumaleon = new Kumaleon__factory(deployer).attach(contractAddress);
    await kumaleon.setMinterAddress(deployer.address);
    expect(await kumaleon.balanceOf(deployer.address)).to.equal(0);
    await kumaleon.mint(deployer.address, 1);
    expect(await kumaleon.balanceOf(deployer.address)).to.equal(1);
  });

  it("has unique hashes", async function () {
    const [deployer] = await ethers.getSigners();
    const kumaleon = new Kumaleon__factory(deployer).attach(contractAddress);
    await kumaleon.setMinterAddress(deployer.address);
    expect(parseInt(await kumaleon.tokenIdToHash(0), 16)).to.equal(0);
    await kumaleon.mint(deployer.address, 1);
    expect(parseInt(await kumaleon.tokenIdToHash(0), 16)).not.to.equal(0);
  });

  it("can not send nonexist token", async function () {
    const [deployer] = await ethers.getSigners();
    const kumaleon = new Kumaleon__factory(deployer).attach(contractAddress);
    await kumaleon.setMinterAddress(deployer.address);
    const erc721sample = new ERC721Sample__factory(deployer).attach(erc721sampleAddress);
    await erc721sample.mint(1);
    await kumaleon.setChildTokenAllowlist(
      erc721sample.address,
      1,
      ethers.constants.MaxUint256,
      deployer.address
    );
    await kumaleon.setMoltingHelperAddress(deployer.address);
    await kumaleon.setGenArt(kumaleonGenArtAddress);

    // kumaleon #0 is not exist, erc721sample #0 is not exsit
    await expect(
      kumaleon["safeTransferChild(uint256,address,address,uint256)"](
        0,
        deployer.address,
        erc721sample.address,
        0
      )
    ).to.revertedWith("Kumaleon: Child asset is not owned by a token in this contract");

    await kumaleon.mint(deployer.address, 1);
    await kumaleon.molt(deployer.address, [0], [1]);
    await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
      deployer.address,
      kumaleon.address,
      1,
      byte0
    );

    // kumaleon #0 is exist, erc721sample #0 is not exsit
    await expect(
      kumaleon["safeTransferChild(uint256,address,address,uint256)"](
        0,
        deployer.address,
        deployer.address,
        0
      )
    ).to.revertedWith("Kumaleon: Child asset is not owned by a token in this contract");
  });

  it("can receive children", async function () {
    const [deployer] = await ethers.getSigners();
    const kumaleon = new Kumaleon__factory(deployer).attach(contractAddress);
    await kumaleon.setMinterAddress(deployer.address);
    const erc721sample = new ERC721Sample__factory(deployer).attach(erc721sampleAddress);

    await erc721sample.mint(1);
    await kumaleon.mint(deployer.address, 1);
    await kumaleon.setChildTokenAllowlist(
      erc721sample.address,
      1,
      ethers.constants.MaxUint256,
      deployer.address
    );
    await kumaleon.setMoltingHelperAddress(deployer.address);
    await kumaleon.setGenArt(kumaleonGenArtAddress);
    await kumaleon.molt(deployer.address, [0], [1]);

    expect(await kumaleon.isChildTokenAcceptable()).to.equal(true);

    await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
      deployer.address,
      kumaleon.address,
      1,
      byte0
    );
    expect((await kumaleon.ownerOfChild(erc721sample.address, 1)).parentTokenId).to.equal(
      ethers.BigNumber.from(0)
    );
    expect(await kumaleon.totalChildContracts(0)).to.equal(1);
    expect(await kumaleon.childContractByIndex(0, 0)).to.equal(erc721sample.address);
    expect(await kumaleon.childTokenByIndex(0, erc721sample.address, 0)).to.equal(
      ethers.BigNumber.from(1)
    );

    await kumaleon["safeTransferChild(uint256,address,address,uint256)"](
      0,
      deployer.address,
      erc721sample.address,
      1
    );

    expect(await erc721sample.ownerOf(1)).to.equal(deployer.address);
    await expect(kumaleon.ownerOfChild(erc721sample.address, 1)).to.revertedWith(
      "That child is not owned by a token in this contract"
    );
  });

  it("can restrict child address", async function () {
    const [deployer] = await ethers.getSigners();
    const kumaleon = new Kumaleon__factory(deployer).attach(contractAddress);
    await kumaleon.setMinterAddress(deployer.address);
    await kumaleon.setIsChildTokenAcceptable(true);
    const erc721sample = new ERC721Sample__factory(deployer).attach(erc721sampleAddress);

    await erc721sample.mint(1);
    await erc721sample.mint(2);
    await kumaleon.mint(deployer.address, 1);
    await kumaleon.setMoltingHelperAddress(deployer.address);
    await kumaleon.setGenArt(kumaleonGenArtAddress);
    await kumaleon.molt(deployer.address, [0], [1]);

    await expect(
      erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
        deployer.address,
        kumaleon.address,
        1,
        byte0
      )
    ).to.revertedWith("Token not allowed");

    await kumaleon.setChildTokenAllowlist(erc721sample.address, 0, 2, deployer.address);
    await kumaleon.setChildTokenAllowlist(
      erc721sample.address,
      1000,
      ethers.constants.MaxUint256,
      deployer.address
    );
    expect((await kumaleon.childTokenAllowlistByAddress(erc721sample.address)).length).to.equal(2);
    expect(
      (await kumaleon.childTokenAllowlistByAddress(erc721sample.address)).map((a) =>
        a.map((aa) => aa.toString())
      )
    ).to.eql([
      ["0", "2", deployer.address],
      ["1000", ethers.constants.MaxUint256.toString(), deployer.address],
    ]);

    await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
      deployer.address,
      kumaleon.address,
      1,
      byte0
    );

    await kumaleon.deleteChildTokenAllowlist(erc721sample.address, 0);
    expect(
      (await kumaleon.childTokenAllowlistByAddress(erc721sample.address)).map((a) =>
        a.map((aa) => aa.toString())
      )
    ).to.eql([["1000", ethers.constants.MaxUint256.toString(), deployer.address]]);

    // return to owner
    await kumaleon["safeTransferChild(uint256,address,address,uint256)"](
      0,
      deployer.address,
      erc721sample.address,
      1
    );

    await expect(
      erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
        deployer.address,
        kumaleon.address,
        2,
        byte0
      )
    ).to.revertedWith("Token not allowed");

    await kumaleon.deleteChildTokenAllowlist(erc721sample.address, 0);
    expect((await kumaleon.childTokenAllowlistByAddress(erc721sample.address)).length).to.equal(0);
  });

  it("return a child token when received a new token", async function () {
    const [deployer] = await ethers.getSigners();
    const kumaleon = new Kumaleon__factory(deployer).attach(contractAddress);
    await kumaleon.setMinterAddress(deployer.address);
    await kumaleon.setIsChildTokenAcceptable(true);
    const erc721sample = new ERC721Sample__factory(deployer).attach(erc721sampleAddress);
    const erc721sample2 = new ERC721Sample__factory(deployer).attach(erc721sample2Address);
    await kumaleon.setChildTokenAllowlist(erc721sampleAddress, 0, 1, deployer.address);
    await kumaleon.setChildTokenAllowlist(erc721sample2Address, 0, 1, deployer.address);
    await kumaleon.mint(deployer.address, 1);
    await erc721sample.mint(1);
    await erc721sample2.mint(1);
    await kumaleon.setMoltingHelperAddress(deployer.address);
    await kumaleon.setGenArt(kumaleonGenArtAddress);
    await kumaleon.molt(deployer.address, [0], [1]);

    await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
      deployer.address,
      kumaleon.address,
      1,
      byte0
    );
    await erc721sample2["safeTransferFrom(address,address,uint256,bytes)"](
      deployer.address,
      kumaleon.address,
      1,
      byte0
    );

    expect(await kumaleon.totalChildContracts(0)).to.equal(1);
    expect(await erc721sample.ownerOf(1)).to.equal(deployer.address);
    expect(await erc721sample2.ownerOf(1)).to.equal(kumaleon.address);
  });

  describe("functions", function () {
    let deployer: any;
    let tester1: any;
    let tester2: any;
    let kumaleon: any;
    let erc721sample: any;
    let erc721sample2: any;
    let genArt: any;

    beforeEach(async () => {
      [deployer, tester1, tester2] = await ethers.getSigners();
      kumaleon = new Kumaleon__factory(deployer).attach(contractAddress);
      await kumaleon.setMinterAddress(deployer.address);
      await kumaleon.setIsChildTokenAcceptable(true);
      erc721sample = new ERC721Sample__factory(deployer).attach(erc721sampleAddress);
      erc721sample2 = new ERC721Sample__factory(deployer).attach(erc721sample2Address);
      const KumaleonGenArt = new KumaleonGenArt__factory(deployer);
      genArt = await KumaleonGenArt.deploy("test", "TEST");
      await kumaleon.setChildTokenAllowlist(erc721sampleAddress, 0, 1, tester1.address);
      await kumaleon.setChildTokenAllowlist(erc721sample2Address, 0, 1, tester2.address);
      await kumaleon.setChildTokenAllowlist(genArt.address, 0, 1, deployer.address);
      await kumaleon.mint(deployer.address, 1);
      await genArt.addMintWhitelisted(deployer.address);
      await genArt.setKumaleon(kumaleon.address);
      await genArt.addProject("test", deployer.address, 0);
      await erc721sample.mint(1);
      await erc721sample2.mint(1);
      await kumaleon.setDefaultBeneficiary(tester1.address);
      await kumaleon.setRoyaltyPercentage(10);
      await kumaleon.setGenArt(genArt.address);
    });

    describe(".safeTransferFrom", function () {
      it("can transfer", async function () {
        await kumaleon["safeTransferFrom(address,address,uint256)"](
          deployer.address,
          tester1.address,
          0
        );
        expect(await kumaleon.ownerOf(0)).to.equal(tester1.address);
      });

      it("can not transfer after molt", async function () {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);
        await expect(
          kumaleon["safeTransferFrom(address,address,uint256)"](
            deployer.address,
            tester1.address,
            0
          )
        ).to.revertedWith("Kumaleon: transfer is not allowed");

        await increaseBlockNumber((15 * 60) / 15);

        await kumaleon["safeTransferFrom(address,address,uint256)"](
          deployer.address,
          tester1.address,
          0
        );
      });

      it("can not transfer after child transfer", async function () {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);
        await increaseBlockNumber((15 * 60) / 15);
        await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
          deployer.address,
          kumaleon.address,
          1,
          byte0
        );
        await kumaleon["safeTransferChild(uint256,address,address,uint256)"](
          0,
          tester1.address,
          erc721sample.address,
          1
        );

        await expect(
          kumaleon["safeTransferFrom(address,address,uint256)"](
            deployer.address,
            tester1.address,
            0
          )
        ).to.revertedWith("Kumaleon: transfer is not allowed");

        await increaseBlockNumber((15 * 60) / 15);

        await kumaleon["safeTransferFrom(address,address,uint256)"](
          deployer.address,
          tester1.address,
          0
        );
      });

      it("emit event", async function () {
        await expect(
          kumaleon["safeTransferFrom(address,address,uint256)"](
            deployer.address,
            tester1.address,
            0
          )
        )
          .to.emit(kumaleon, "KumaleonTransfer")
          .withArgs(0, ethers.constants.AddressZero, 0);
      });

      it("emit event with child", async function () {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);
        await increaseBlockNumber((15 * 60) / 15);
        await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
          deployer.address,
          kumaleon.address,
          1,
          byte0
        );
        await expect(
          kumaleon["safeTransferFrom(address,address,uint256)"](
            deployer.address,
            tester1.address,
            0
          )
        )
          .to.emit(kumaleon, "KumaleonTransfer")
          .withArgs(0, erc721sample.address, 1);
      });
    });

    describe(".mint", function () {
      it("can mint", async function () {
        await expect(kumaleon.ownerOf(1)).to.revertedWith(
          "ERC721: owner query for nonexistent token"
        );
        await kumaleon.mint(deployer.address, 2);
        expect(await kumaleon.ownerOf(1)).to.equal(deployer.address);
        expect(await kumaleon.ownerOf(2)).to.equal(deployer.address);
      });

      it("can mint from only minter", async function () {
        await kumaleon.setMinterAddress(tester1.address);
        await expect(kumaleon.mint(deployer.address, 2)).to.revertedWith(
          "Kumaleon: call from only minter"
        );
      });

      it("can not mint amounts over supply", async function () {
        await expect(kumaleon.mint(deployer.address, 3000)).to.revertedWith(
          "Kumaleon: invalid quantity"
        );
      });

      it("increments totalSupply", async function () {
        expect(await kumaleon.totalSupply()).to.equal(1);
        await kumaleon.mint(deployer.address, 2);
        expect(await kumaleon.totalSupply()).to.equal(3);
      });
    });

    describe(".molt", function () {
      beforeEach(async () => {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await genArt.setKumaleon(kumaleon.address);
      });

      it("can mint gen art token", async function () {
        expect(await kumaleon.isMolted(0)).to.equal(false);
        await kumaleon.molt(deployer.address, [0], [2]);
        expect(await genArt.ownerOf(2)).to.equal(deployer.address);
        expect(await kumaleon.isMolted(0)).to.equal(true);
        expect(await kumaleon.tokenIdToHash(0)).to.equal(await genArt.tokenIdToHash(2));
      });

      it("can not molt twice", async function () {
        await kumaleon.molt(deployer.address, [0], [2]);
        await expect(kumaleon.molt(deployer.address, [0], [2])).to.revertedWith(
          "ERC721: token already minted"
        );
      });

      it("can not mint gen art with other's token", async function () {
        await kumaleon["safeTransferFrom(address,address,uint256)"](
          deployer.address,
          tester1.address,
          0
        );
        await expect(kumaleon.molt(deployer.address, [0], [2])).to.revertedWith(
          "Kumaleon: Token not owned"
        );
      });

      it("can mint multiple gen art token", async function () {
        await kumaleon.mint(deployer.address, 1);
        await kumaleon.molt(deployer.address, [0, 1], [2, 3]);
        expect(await genArt.ownerOf(2)).to.equal(deployer.address);
        expect(await genArt.ownerOf(3)).to.equal(deployer.address);
        expect(await kumaleon.isMolted(0)).to.equal(true);
        expect(await kumaleon.isMolted(1)).to.equal(true);
        expect(await kumaleon.tokenIdToHash(0)).to.equal(await genArt.tokenIdToHash(2));
        expect(await kumaleon.tokenIdToHash(1)).to.equal(await genArt.tokenIdToHash(3));
        expect(await genArt.tokenIdToHash(2)).to.not.equal(await genArt.tokenIdToHash(3));
      });

      it("require valid length params", async function () {
        await kumaleon.mint(deployer.address, 1);
        await expect(kumaleon.molt(deployer.address, [0, 1], [2])).to.revertedWith(
          "Kumaleon: invalid length"
        );
      });

      it("can mint from only helper", async function () {
        await kumaleon.setMoltingHelperAddress(tester1.address);
        await expect(kumaleon.molt(deployer.address, [0], [2])).to.revertedWith(
          "Kumaleon: call from only molting helper"
        );
      });

      it("emit event", async function () {
        await expect(kumaleon.molt(deployer.address, [0], [2]))
          .to.emit(kumaleon, "TransferChild")
          .withArgs(0, deployer.address, genArt.address, 2);
      });
    });

    describe(".setBaseURI", function () {
      it("can set baseURI", async function () {
        expect(await kumaleon.tokenURI(0)).to.equal("");
        await kumaleon.setBaseURI("https://www.kumaleon.com/");
        expect(await kumaleon.tokenURI(0)).to.equal("https://www.kumaleon.com/0");
      });

      it("emit event", async function () {
        await expect(kumaleon.setBaseURI("https://www.kumaleon.com/")).to.emit(
          kumaleon,
          "BaseURIUpdated"
        );
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.setBaseURI("https://www.kumaleon.com/")).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe(".freezeMetadata", function () {
      it("can freeze baseURI", async function () {
        await kumaleon.freezeMetadata();
        await expect(kumaleon.setBaseURI("https://www2.kumaleon.com/")).to.revertedWith(
          "Kumaleon: Already frozen"
        );
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.freezeMetadata()).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe(".startReveal", function () {
      it("can start reveal", async function () {
        expect(await kumaleon.isRevealStarted()).to.equal(false);
        await kumaleon.startReveal();
        expect(await kumaleon.isRevealStarted()).to.equal(true);
      });

      it("emit event", async function () {
        await expect(kumaleon.startReveal()).to.emit(kumaleon, "StartReveal");
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.startReveal()).to.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe(".setIsChildTokenAcceptable", function () {
      it("can set isChildTokenAcceptable", async function () {
        expect(await kumaleon.isChildTokenAcceptable()).to.equal(true);
        await kumaleon.setIsChildTokenAcceptable(false);
        expect(await kumaleon.isChildTokenAcceptable()).to.equal(false);
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.setIsChildTokenAcceptable(false)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe(".setMinterAddress", function () {
      it("can set minter address", async function () {
        await kumaleon.setMinterAddress(tester2.address);
        expect(await kumaleon.minter()).to.equal(tester2.address);
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.setMinterAddress(tester2.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe(".setMoltingHelperAddress", function () {
      it("can set helper address", async function () {
        await kumaleon.setIsChildTokenAcceptable(false);
        await kumaleon.setMoltingHelperAddress(tester2.address);
        expect(await kumaleon.moltingHelper()).to.equal(tester2.address);
        expect(await kumaleon.isChildTokenAcceptable()).to.equal(true);
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.setMoltingHelperAddress(tester2.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe(".setChildTokenAllowlist", function () {
      it("can set allowlist", async function () {
        await kumaleon.setChildTokenAllowlist(erc721sample2.address, 0, 100, tester2.address);
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample2.address))[1].beneficiary
        ).to.equal(tester2.address);
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample2.address))[1].minTokenId
        ).to.equal(0);
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample2.address))[1].maxTokenId
        ).to.equal(100);
      });

      it("emit event", async function () {
        await expect(
          kumaleon.setChildTokenAllowlist(erc721sample2.address, 0, 100, tester2.address)
        )
          .to.emit(kumaleon, "SetChildTokenAllowlist")
          .withArgs(erc721sample2.address, 0, 100);
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(
          kumaleon2.setChildTokenAllowlist(erc721sample2.address, 0, 100, tester2.address)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe(".deleteChildTokenAllowlist", function () {
      it("can delete allowlist", async function () {
        await kumaleon.deleteChildTokenAllowlist(erc721sample2.address, 0);
        expect(await kumaleon.childTokenAllowlistByAddress(erc721sample2.address)).to.eql([]);
      });

      it("can delete allowlist from multiple records", async function () {
        expect(await kumaleon.childTokenAllowlistByAddress(erc721sample2.address)).to.eql([
          [ethers.BigNumber.from(0), ethers.BigNumber.from(1), tester2.address],
        ]);
        await kumaleon.setChildTokenAllowlist(erc721sample2.address, 100, 200, tester2.address);
        await kumaleon.setChildTokenAllowlist(erc721sample2.address, 200, 300, tester2.address);
        await kumaleon.deleteChildTokenAllowlist(erc721sample2.address, 1);
        expect(await kumaleon.childTokenAllowlistByAddress(erc721sample2.address)).to.eql([
          [ethers.BigNumber.from(0), ethers.BigNumber.from(1), tester2.address],
          [ethers.BigNumber.from(200), ethers.BigNumber.from(300), tester2.address],
        ]);
      });

      it("can not delete nonexist allowlist", async function () {
        await expect(kumaleon.deleteChildTokenAllowlist(erc721sample2.address, 1)).to.revertedWith(
          "Kumaleon: allowlist not found"
        );
      });

      it("emit event", async function () {
        await expect(kumaleon.deleteChildTokenAllowlist(erc721sample2.address, 0))
          .to.emit(kumaleon, "DeleteChildTokenAllowlist")
          .withArgs(erc721sample2.address, 0);
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.deleteChildTokenAllowlist(erc721sample2.address, 0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe(".updateChildTokenAllowlistBeneficiary", function () {
      it("can update allowlist", async function () {
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample2.address))[0].beneficiary
        ).to.equal(tester2.address);
        await kumaleon.updateChildTokenAllowlistBeneficiary(
          erc721sample2.address,
          0,
          tester1.address
        );
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample2.address))[0].beneficiary
        ).to.equal(tester1.address);
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(
          kumaleon2.updateChildTokenAllowlistBeneficiary(erc721sample2.address, 1, tester1.address)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe(".updateChildTokenAllowlistsBeneficiary", function () {
      it("can update allowlist", async function () {
        await kumaleon.setChildTokenAllowlist(erc721sample.address, 0, 100, tester2.address);
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample.address))[0].beneficiary
        ).to.equal(tester1.address);
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample.address))[1].beneficiary
        ).to.equal(tester2.address);
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample2.address))[0].beneficiary
        ).to.equal(tester2.address);

        await kumaleon.updateChildTokenAllowlistsBeneficiary(
          [erc721sample.address, erc721sample.address, erc721sample2.address],
          [0, 1, 0],
          [tester2.address, tester1.address, tester1.address]
        );
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample.address))[0].beneficiary
        ).to.equal(tester2.address);
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample.address))[1].beneficiary
        ).to.equal(tester1.address);
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample2.address))[0].beneficiary
        ).to.equal(tester1.address);
      });

      it("must be with valid length params", async function () {
        await expect(
          kumaleon.updateChildTokenAllowlistsBeneficiary(
            [erc721sample.address, erc721sample.address, erc721sample2.address],
            [0, 1, 0],
            [tester2.address, tester1.address]
          )
        ).to.revertedWith("Kumaleon: invalid length");

        await expect(
          kumaleon.updateChildTokenAllowlistsBeneficiary(
            [erc721sample.address, erc721sample.address, erc721sample2.address],
            [0, 1, 0, 1],
            [tester2.address, tester1.address, tester1.address]
          )
        ).to.revertedWith("Kumaleon: invalid length");
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(
          kumaleon2.updateChildTokenAllowlistsBeneficiary(
            [erc721sample.address, erc721sample.address, erc721sample2.address],
            [0, 1, 0],
            [tester2.address, tester1.address, tester1.address]
          )
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe(".childTokenAllowlistByAddress", function () {
      it("can get child token allowlist", async function () {
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample2.address))[0].beneficiary
        ).to.equal(tester2.address);
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample2.address))[0].minTokenId
        ).to.equal(0);
        expect(
          (await kumaleon.childTokenAllowlistByAddress(erc721sample2.address))[0].maxTokenId
        ).to.equal(1);
      });
    });

    describe(".setGenArt", function () {
      it("can set gen art", async function () {
        expect(await kumaleon.genArt()).to.equal(genArt.address);
        await kumaleon.setGenArt(genArt.address);
        expect(await kumaleon.genArt()).to.equal(genArt.address);
      });

      it("emit event", async function () {
        await expect(kumaleon.setGenArt(genArt.address))
          .to.emit(kumaleon, "SetGenArt")
          .withArgs(genArt.address);
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.setGenArt(genArt.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe(".freezeGenArt", function () {
      it("can freeze baseURI", async function () {
        await kumaleon.freezeGenArt();
        await expect(kumaleon.setGenArt(tester2.address)).to.revertedWith(
          "Kumaleon: Already frozen"
        );
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.freezeGenArt()).to.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe(".onERC721Received", function () {
      describe("can receive and transfer child token", () => {
        beforeEach(async () => {
          await kumaleon.setMoltingHelperAddress(deployer.address);
          await kumaleon.molt(deployer.address, [0], [1]);
          await kumaleon.mint(deployer.address, 1);
          await kumaleon.molt(deployer.address, [1], [2]);
          await erc721sample.mint(0);

          expect(await kumaleon.balanceOf(deployer.address)).to.equal(2);
          expect(await kumaleon.ownerOf(0)).to.equal(deployer.address);
          expect(await kumaleon.ownerOf(1)).to.equal(deployer.address);
          expect(await erc721sample.ownerOf(0)).to.equal(deployer.address);
          expect(await erc721sample.ownerOf(1)).to.equal(deployer.address);
          expect((await kumaleon.childTokenDetail(0))._childContract).to.equal(
            ethers.constants.AddressZero
          );
          expect((await kumaleon.childTokenDetail(0))._childTokenId).to.equal(0);
        });

        it("kumaleon token id != 0, child token is != 0", async function () {
          await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
            deployer.address,
            kumaleon.address,
            1,
            byte1
          );

          expect((await kumaleon.childTokenDetail(1))._childContract).to.equal(
            erc721sample.address
          );
          expect((await kumaleon.childTokenDetail(1))._childTokenId).to.equal(1);
          expect(await kumaleon.totalChildContracts(1)).to.equal(1);
          expect(await kumaleon.totalChildTokens(1, erc721sample.address)).to.equal(1);

          await kumaleon["safeTransferChild(uint256,address,address,uint256)"](
            1,
            deployer.address,
            erc721sample.address,
            1
          );

          expect((await kumaleon.childTokenDetail(1))._childContract).to.equal(
            ethers.constants.AddressZero
          );
          expect((await kumaleon.childTokenDetail(1))._childTokenId).to.equal(0);
          expect(await kumaleon.totalChildContracts(1)).to.equal(0);
          expect(await kumaleon.totalChildTokens(1, erc721sample.address)).to.equal(0);
          expect(await erc721sample.ownerOf(0)).to.equal(deployer.address);
        });

        it("kumaleon token id = 0, child token is != 0", async function () {
          await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
            deployer.address,
            kumaleon.address,
            1,
            byte0
          );

          expect((await kumaleon.childTokenDetail(0))._childContract).to.equal(
            erc721sample.address
          );
          expect((await kumaleon.childTokenDetail(0))._childTokenId).to.equal(1);
          expect(await kumaleon.totalChildContracts(0)).to.equal(1);
          expect(await kumaleon.totalChildTokens(0, erc721sample.address)).to.equal(1);

          await kumaleon["safeTransferChild(uint256,address,address,uint256)"](
            0,
            deployer.address,
            erc721sample.address,
            1
          );

          expect((await kumaleon.childTokenDetail(0))._childContract).to.equal(
            ethers.constants.AddressZero
          );
          expect((await kumaleon.childTokenDetail(0))._childTokenId).to.equal(0);
          expect(await kumaleon.totalChildContracts(0)).to.equal(0);
          expect(await kumaleon.totalChildTokens(0, erc721sample.address)).to.equal(0);
          expect(await erc721sample.ownerOf(0)).to.equal(deployer.address);
        });

        it("kumaleon token id = 0, child token is = 0", async function () {
          await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
            deployer.address,
            kumaleon.address,
            0,
            byte0
          );

          expect((await kumaleon.childTokenDetail(0))._childContract).to.equal(
            erc721sample.address
          );
          expect((await kumaleon.childTokenDetail(0))._childTokenId).to.equal(0);
          expect(await kumaleon.totalChildContracts(0)).to.equal(1);
          expect(await kumaleon.totalChildTokens(0, erc721sample.address)).to.equal(1);

          await kumaleon["safeTransferChild(uint256,address,address,uint256)"](
            0,
            deployer.address,
            erc721sample.address,
            0
          );

          expect((await kumaleon.childTokenDetail(0))._childContract).to.equal(
            ethers.constants.AddressZero
          );
          expect((await kumaleon.childTokenDetail(0))._childTokenId).to.equal(0);
          expect(await kumaleon.totalChildContracts(0)).to.equal(0);
          expect(await kumaleon.totalChildTokens(0, erc721sample.address)).to.equal(0);
          expect(await erc721sample.ownerOf(0)).to.equal(deployer.address);
        });

        it("kumaleon token id != 0, child token is = 0", async function () {
          await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
            deployer.address,
            kumaleon.address,
            0,
            byte1
          );

          expect((await kumaleon.childTokenDetail(1))._childContract).to.equal(
            erc721sample.address
          );
          expect((await kumaleon.childTokenDetail(1))._childTokenId).to.equal(0);
          expect(await kumaleon.totalChildContracts(1)).to.equal(1);
          expect(await kumaleon.totalChildTokens(1, erc721sample.address)).to.equal(1);

          await kumaleon["safeTransferChild(uint256,address,address,uint256)"](
            1,
            deployer.address,
            erc721sample.address,
            0
          );

          expect((await kumaleon.childTokenDetail(1))._childContract).to.equal(
            ethers.constants.AddressZero
          );
          expect((await kumaleon.childTokenDetail(1))._childTokenId).to.equal(0);
          expect(await kumaleon.totalChildContracts(1)).to.equal(0);
          expect(await kumaleon.totalChildTokens(1, erc721sample.address)).to.equal(0);
          expect(await erc721sample.ownerOf(0)).to.equal(deployer.address);
        });
      });

      it("can receive tokens after molted", async function () {
        await expect(
          erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
            deployer.address,
            kumaleon.address,
            1,
            byte0
          )
        ).to.revertedWith("Kumaleon: Child received before molt");

        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);

        await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
          deployer.address,
          kumaleon.address,
          1,
          byte0
        );
        expect((await kumaleon.childTokenDetail(0))._childContract).to.equal(erc721sample.address);
        expect((await kumaleon.childTokenDetail(0))._childTokenId).to.equal(1);
      });

      it("can receive with bytes8 tokenId", async function () {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);

        expect((await kumaleon.childTokenDetail(0))._childContract).to.equal(
          ethers.constants.AddressZero
        );
        expect((await kumaleon.childTokenDetail(0))._childTokenId).to.equal(0);

        await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
          deployer.address,
          kumaleon.address,
          1,
          ethers.utils.hexZeroPad(ethers.utils.hexValue(0), 8)
        );

        expect((await kumaleon.childTokenDetail(0))._childContract).to.equal(erc721sample.address);
        expect((await kumaleon.childTokenDetail(0))._childTokenId).to.equal(1);
      });

      it("can not call without a token", async function () {
        await expect(
          erc721sample.callOnERC721Received(kumaleon.address, deployer.address, 1, byte0)
        ).to.revertedWith("Kumaleon: Child token not owned.");
      });

      it("can not accept a token when isChildTokenAcceptable = false", async function () {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);
        await kumaleon.setIsChildTokenAcceptable(false);
        await expect(
          erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
            deployer.address,
            kumaleon.address,
            1,
            ethers.utils.hexZeroPad(ethers.utils.hexValue(0), 8)
          )
        ).to.revertedWith("Kumaleon: Child received while paused");
      });

      it("accepts only from parent owner", async function () {
        const erc721sample2 = new ERC721Sample__factory(tester1).attach(erc721sample.address);
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);
        await erc721sample["safeTransferFrom(address,address,uint256)"](
          deployer.address,
          tester1.address,
          1
        );
        await expect(
          erc721sample2["safeTransferFrom(address,address,uint256,bytes)"](
            tester1.address,
            kumaleon.address,
            1,
            ethers.utils.hexZeroPad(ethers.utils.hexValue(0), 8)
          )
        ).to.revertedWith("Kumaleon: only owner can transfer child tokens");
      });
    });

    describe(".getChild", function () {
      it("can receive old ERC721 tokens", async function () {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);
        const OldERC721Sample = new OldERC721Sample__factory(deployer);
        const oldERC721Sample = await OldERC721Sample.deploy();
        await kumaleon.setChildTokenAllowlist(oldERC721Sample.address, 0, 1, tester1.address);
        await oldERC721Sample.mint(1);
        expect(await oldERC721Sample.ownerOf(1)).to.equal(deployer.address);
        await oldERC721Sample.approve(kumaleon.address, 1);
        await kumaleon.getChild(deployer.address, 0, oldERC721Sample.address, 1);
        expect(await oldERC721Sample.ownerOf(1)).to.equal(kumaleon.address);
        expect((await kumaleon.ownerOfChild(oldERC721Sample.address, 1)).parentTokenId).to.equal(
          ethers.BigNumber.from(0)
        );
        // return
        await kumaleon["safeTransferChild(uint256,address,address,uint256)"](
          0,
          tester1.address,
          oldERC721Sample.address,
          1
        );
        expect(await oldERC721Sample.ownerOf(1)).to.equal(tester1.address);
      });
    });

    describe(".rootOwnerOfChild", function () {
      beforeEach(async function () {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);
        await erc721sample.mint(0);
        await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
          deployer.address,
          kumaleon.address,
          0,
          byte0
        );
      });

      it("returns rootOwner", async function () {
        expect(await kumaleon.rootOwnerOfChild(erc721sample.address, 0)).to.equal(
          "0xcd740db50000000000000000" + deployer.address.replace(/^0x/, "").toLowerCase()
        );
      });

      it("returns other contract rootOwner", async function () {
        // prepare Kumaleon2
        const Kumaleon2 = new Kumaleon__factory(deployer);
        const kumaleon2 = await Kumaleon2.deploy(deployer.address);
        const KumaleonGenArt = new KumaleonGenArt__factory(deployer);
        const genArt2 = await KumaleonGenArt.deploy("test", "TEST");
        await genArt2.setKumaleon(kumaleon2.address);
        await genArt2.addProject("test", deployer.address, 0);
        await kumaleon2.setGenArt(genArt2.address);
        await kumaleon2.setMinterAddress(deployer.address);
        await kumaleon2.setMoltingHelperAddress(deployer.address);

        // transfer child kumaleon #0 -> parent kumaleon #1
        await kumaleon.mint(deployer.address, 1);
        await kumaleon.molt(deployer.address, [1], [2]);
        await kumaleon.setChildTokenAllowlist(kumaleon.address, 0, 1, deployer.address);
        await increaseBlockNumber(60);
        await kumaleon["safeTransferFrom(address,address,uint256,bytes)"](
          deployer.address,
          kumaleon.address,
          0,
          byte1
        );

        // transfer child kumaleon #1 -> parent kumaleon2 #0
        await kumaleon2.mint(deployer.address, 1);
        await kumaleon2.molt(deployer.address, [0], [1]);
        await kumaleon2.setChildTokenAllowlist(kumaleon.address, 0, 1, deployer.address);
        await increaseBlockNumber(60);
        await kumaleon["safeTransferFrom(address,address,uint256,bytes)"](
          deployer.address,
          kumaleon2.address,
          1,
          byte0
        );

        // owner > parent > child
        // deployer > kumaleon2 #0 > kumaleon #1 > kumaleon #0 > erc721sample #0

        expect(await kumaleon.rootOwnerOfChild(erc721sample.address, 0)).to.equal(
          "0xcd740db50000000000000000" + deployer.address.replace(/^0x/, "").toLowerCase()
        );
      });
    });

    describe(".safeTransferChild", function () {
      beforeEach(async function () {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);
        await erc721sample.mint(0);
        await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
          deployer.address,
          kumaleon.address,
          0,
          byte0
        );
      });

      it("can transfer child from token id 0 parent", async function () {
        await kumaleon["safeTransferChild(uint256,address,address,uint256)"](
          0,
          tester1.address,
          erc721sample.address,
          0
        );
        expect(await erc721sample.ownerOf(0)).to.equal(tester1.address);
      });

      it("can transfer child with data", async function () {
        await kumaleon["safeTransferChild(uint256,address,address,uint256,bytes)"](
          0,
          tester1.address,
          erc721sample.address,
          0,
          byte0
        );
        expect(await erc721sample.ownerOf(0)).to.equal(tester1.address);
      });

      it("can call from only token owner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(
          kumaleon2["safeTransferChild(uint256,address,address,uint256)"](
            0,
            tester1.address,
            erc721sample.address,
            0
          )
        ).to.revertedWith("Kumaleon: Not allowed to transfer child assets of parent");
        await expect(
          kumaleon2["safeTransferChild(uint256,address,address,uint256,bytes)"](
            0,
            tester1.address,
            erc721sample.address,
            0,
            byte0
          )
        ).to.revertedWith("Kumaleon: Not allowed to transfer child assets of parent");
      });

      it("can not transfer child which parent does not own", async function () {
        await expect(
          kumaleon["safeTransferChild(uint256,address,address,uint256)"](
            1,
            tester1.address,
            erc721sample.address,
            0
          )
        ).to.revertedWith("Kumaleon: Parent does not own that asset");
      });
    });

    describe(".transferChild", function () {
      beforeEach(async function () {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);
        await erc721sample.mint(0);

        await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
          deployer.address,
          kumaleon.address,
          0,
          byte0
        );
      });

      // TODO: CHECK THIS TEST IS NEEDED OR NOT
      it.skip("can transfer child", async function () {
        await kumaleon["transferChild(uint256,address,address,uint256)"](
          0,
          deployer.address,
          erc721sample.address,
          0
        );
        expect(await erc721sample.ownerOf(0)).to.equal(deployer.address);
      });

      it("can call from only token owner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(
          kumaleon2.transferChild(0, deployer.address, erc721sample.address, 0)
        ).to.revertedWith("Kumaleon: Not allowed to transfer child assets of parent");
      });
    });

    describe(".totalChildTokens", function () {
      beforeEach(async function () {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);
        await erc721sample.mint(0);

        await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
          deployer.address,
          kumaleon.address,
          0,
          byte0
        );
      });

      it("returns total child tokens number", async function () {
        expect(await kumaleon.totalChildTokens(0, erc721sample.address)).to.equal(1);
      });
    });

    describe("isParentTransferable", () => {
      describe("gas usage", () => {
        it("before molting", async () => {
          const tx = await kumaleon["safeTransferFrom(address,address,uint256)"](
            deployer.address,
            tester1.address,
            0
          );
          const receipt = await tx.wait();
          // expect(receipt.gasUsed).to.equal(66758); // current implementation
          expect(receipt.gasUsed).to.equal(68925); // removed zero block comparison
        });

        it("after molting", async () => {
          await kumaleon.setMoltingHelperAddress(deployer.address);
          await kumaleon.molt(deployer.address, [0], [1]);
          await increaseBlockNumber(30);
          const tx = await kumaleon["safeTransferFrom(address,address,uint256)"](
            deployer.address,
            tester1.address,
            0
          );
          const receipt = await tx.wait();
          // expect(receipt.gasUsed).to.equal(69106); // current implementation
          expect(receipt.gasUsed).to.equal(68925); // removed zero block comparison
        });
      });
    });

    describe(".updateParentLockAge", function () {
      it("can set age", async function () {
        await expect(await kumaleon.parentLockAge()).to.equal(25);
        await kumaleon.updateParentLockAge(60);
        await expect(await kumaleon.parentLockAge()).to.equal(60);
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.updateParentLockAge(60)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe(".childTokenDetail", function () {
      it("return detail", async function () {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);

        expect((await kumaleon.childTokenDetail(0))._childContract).to.equal(
          ethers.constants.AddressZero
        );
        expect((await kumaleon.childTokenDetail(0))._childTokenId).to.equal(0);
        await erc721sample["safeTransferFrom(address,address,uint256,bytes)"](
          deployer.address,
          kumaleon.address,
          1,
          byte0
        );
        expect((await kumaleon.childTokenDetail(0))._childContract).to.equal(erc721sample.address);
        expect((await kumaleon.childTokenDetail(0))._childTokenId).to.equal(1);
      });
    });

    describe(".royaltyInfo", function () {
      beforeEach(async () => {
        await kumaleon.setMoltingHelperAddress(deployer.address);
        await kumaleon.molt(deployer.address, [0], [1]);
      });

      it("returns default royalty info", async function () {
        await kumaleon.setDefaultBeneficiary(tester1.address);
        await kumaleon.setRoyaltyPercentage(20);
        await expect((await kumaleon.royaltyInfo(0, 100)).receiver).to.equal(tester1.address);
        await expect((await kumaleon.royaltyInfo(0, 100)).royaltyAmount).to.equal(
          ethers.BigNumber.from(20)
        );
      });

      it("returns allowlist royalty info", async function () {
        await kumaleon.setDefaultBeneficiary(tester1.address);
        await kumaleon.setRoyaltyPercentage(20);
        await erc721sample2.approve(kumaleon.address, 1);
        await kumaleon.getChild(deployer.address, 0, erc721sample2.address, 1);
        await expect((await kumaleon.royaltyInfo(0, 100)).receiver).to.equal(tester2.address);
        await expect((await kumaleon.royaltyInfo(0, 100)).royaltyAmount).to.equal(
          ethers.BigNumber.from(20)
        );
      });

      it("returns other royalty info", async function () {
        await kumaleon.setDefaultBeneficiary(tester1.address);
        await kumaleon.setRoyaltyPercentage(20);
        await kumaleon.setChildTokenAllowlist(erc721sample2.address, 100, 200, deployer.address);
        await erc721sample2.approve(kumaleon.address, 1);
        await kumaleon.getChild(deployer.address, 0, erc721sample2.address, 1);
        await kumaleon.deleteChildTokenAllowlist(erc721sample2.address, 0);
        await expect((await kumaleon.royaltyInfo(0, 100)).receiver).to.equal(tester1.address);
        await expect((await kumaleon.royaltyInfo(0, 100)).royaltyAmount).to.equal(
          ethers.BigNumber.from(20)
        );
      });
    });

    describe(".supportsInterface", function () {
      it("returns true when supported", async function () {
        expect(await kumaleon.supportsInterface("0xcde244d9")).to.equal(true); // ERC998
        expect(await kumaleon.supportsInterface("0xa344afe4")).to.equal(true); // 998ERC721TopDownEnumerable
        expect(await kumaleon.supportsInterface("0x2a55205a")).to.equal(true); // ERC2981
        expect(await kumaleon.supportsInterface("0x150b7a02")).to.equal(true); // ERC721Receiver
      });
    });

    describe(".setDefaultBeneficiary", function () {
      it("can set default royalty", async function () {
        await expect((await kumaleon.royaltyInfo(1, 100)).receiver).to.equal(tester1.address);
        await kumaleon.setDefaultBeneficiary(tester2.address);
        await expect((await kumaleon.royaltyInfo(1, 100)).receiver).to.equal(tester2.address);
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.setDefaultBeneficiary(tester2.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe(".setRoyaltyPercentage", function () {
      it("can set default royalty", async function () {
        await expect((await kumaleon.royaltyInfo(1, 100)).royaltyAmount).to.equal(10);
        await kumaleon.setRoyaltyPercentage(20);
        await expect((await kumaleon.royaltyInfo(1, 100)).royaltyAmount).to.equal(20);
      });

      it("onlyOwner", async function () {
        const kumaleon2 = new Kumaleon__factory(tester1).attach(contractAddress);
        await expect(kumaleon2.setRoyaltyPercentage(20)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });
});
